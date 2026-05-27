import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionEventType as PrismaAuctionEventType,
  AuctionStatus as PrismaAuctionStatus,
  BidStatus as PrismaBidStatus,
  OrderStatus as PrismaOrderStatus,
  type AuctionRule,
  type AuctionSession,
  type Bid,
  type Order
} from "@prisma/client";
import { AuctionErrorCode } from "@live-auction/shared";
import { AuctionSchedulerService } from "../auction/auction-scheduler.service";
import { AuctionStateMachineService } from "../auction/auction-state-machine.service";
import { ApiException } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";
import {
  type AtomicBidInput,
  type AtomicBidResult,
  RedisBidAtomicStore
} from "./bid-redis.store";
import { BidService } from "./bid.service";

type AuctionForBid = AuctionSession & {
  rule: AuctionRule;
  order?: Order | null;
};

class FakePrisma {
  readonly auctions = new Map<string, AuctionForBid>();
  readonly bids = new Map<string, Bid>();
  readonly events: Array<{
    auctionId: string;
    type: PrismaAuctionEventType;
    serverSeq: number;
  }> = [];
  readonly orders = new Map<string, Order>();
  readonly auditLogs: Array<Record<string, unknown>> = [];

  readonly auctionSession = {
    findUnique: async ({ where }: { where: { id: string } }): Promise<AuctionForBid | null> =>
      this.auctions.get(where.id) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }): Promise<AuctionForBid> => {
      const auction = this.auctions.get(where.id);
      if (!auction) {
        throw new Error(`Auction ${where.id} not found`);
      }

      return auction;
    },
    updateMany: async ({
      where,
      data
    }: {
      where: {
        id: string;
        status?: PrismaAuctionStatus;
        serverSeq?: { lt: number };
      };
      data: Partial<AuctionSession> & { version?: { increment: number } };
    }): Promise<{ count: number }> => {
      const auction = this.auctions.get(where.id);
      if (!auction) {
        return { count: 0 };
      }

      if (where.status && auction.status !== where.status) {
        return { count: 0 };
      }

      if (where.serverSeq && auction.serverSeq >= where.serverSeq.lt) {
        return { count: 0 };
      }

      this.auctions.set(where.id, {
        ...auction,
        ...data,
        rule: auction.rule,
        order: auction.order,
        version: auction.version + (data.version?.increment ?? 0)
      });

      return { count: 1 };
    }
  };

  readonly bid = {
    findUnique: async ({
      where
    }: {
      where: {
        auctionId_clientBidId: {
          auctionId: string;
          clientBidId: string;
        };
      };
    }): Promise<Bid | null> =>
      [...this.bids.values()].find(
        (bid) =>
          bid.auctionId === where.auctionId_clientBidId.auctionId &&
          bid.clientBidId === where.auctionId_clientBidId.clientBidId
      ) ?? null,
    create: async ({
      data
    }: {
      data: {
        auctionId: string;
        userId: string;
        amountFen: number;
        clientBidId: string;
        serverSeq: number;
        status: PrismaBidStatus;
      };
    }): Promise<Bid> => {
      const existing = [...this.bids.values()].find(
        (bid) => bid.auctionId === data.auctionId && bid.clientBidId === data.clientBidId
      );

      if (existing) {
        throw { code: "P2002" };
      }

      const bid: Bid = {
        id: `bid_${this.bids.size + 1}`,
        auctionId: data.auctionId,
        userId: data.userId,
        amountFen: data.amountFen,
        clientBidId: data.clientBidId,
        serverSeq: data.serverSeq,
        status: data.status,
        rejectReason: null,
        createdAt: new Date()
      };

      this.bids.set(bid.id, bid);
      return bid;
    }
  };

  readonly auctionEvent = {
    create: async ({
      data
    }: {
      data: {
        auctionId: string;
        type: PrismaAuctionEventType;
        serverSeq: number;
      };
    }) => {
      this.events.push({
        auctionId: data.auctionId,
        type: data.type,
        serverSeq: data.serverSeq
      });

      return { id: `event_${this.events.length}`, ...data };
    }
  };

  readonly auditLog = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.auditLogs.push(data);
      return { id: `audit_${this.auditLogs.length}`, ...data };
    }
  };

  async $transaction<T>(operation: (tx: this) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

class FakeAtomicStore {
  private readonly states = new Map<
    string,
    {
      status: PrismaAuctionStatus;
      currentPriceFen: number;
      highestBidderId: string | null;
      endTimeMs: number;
      bidCount: number;
      serverSeq: number;
      extendedCount: number;
      acceptedClientBidIds: Set<string>;
    }
  >();

  async placeBid(input: AtomicBidInput): Promise<AtomicBidResult> {
    const state = this.getOrCreateState(input);

    if (state.acceptedClientBidIds.has(input.clientBidId)) {
      return rejected(input.auction.id, AuctionErrorCode.DuplicateClientBid);
    }

    if (state.status !== PrismaAuctionStatus.RUNNING) {
      return rejected(input.auction.id, AuctionErrorCode.AuctionAlreadyEnded);
    }

    if (input.now.getTime() > state.endTimeMs) {
      return rejected(input.auction.id, AuctionErrorCode.AuctionAlreadyEnded);
    }

    if (state.highestBidderId === input.userId) {
      return rejected(
        input.auction.id,
        AuctionErrorCode.BidderAlreadyLeading,
        state
      );
    }

    if (input.amountFen <= state.currentPriceFen) {
      return rejected(input.auction.id, AuctionErrorCode.BidAmountTooLow, state);
    }

    if ((input.amountFen - state.currentPriceFen) % input.auction.incrementFen !== 0) {
      return rejected(input.auction.id, AuctionErrorCode.BidIncrementInvalid, state);
    }

    if (input.amountFen > input.auction.capPriceFen) {
      return rejected(input.auction.id, AuctionErrorCode.BidExceedsCapPrice, state);
    }

    const previousPriceFen = state.currentPriceFen;
    const previousHighestBidderId = state.highestBidderId;
    const reachedCapPrice = input.amountFen >= input.auction.capPriceFen;
    let extended = false;
    let newEndTimeMs = state.endTimeMs;

    if (
      !reachedCapPrice &&
      input.auction.rule.antiSnipingWindowSeconds > 0 &&
      input.auction.rule.extensionSeconds > 0 &&
      input.auction.rule.maxExtensionCount > 0 &&
      state.endTimeMs - input.now.getTime() <= input.auction.rule.antiSnipingWindowSeconds * 1000 &&
      state.extendedCount < input.auction.rule.maxExtensionCount
    ) {
      extended = true;
      state.extendedCount += 1;
      newEndTimeMs = state.endTimeMs + input.auction.rule.extensionSeconds * 1000;
      state.endTimeMs = newEndTimeMs;
    }

    state.currentPriceFen = input.amountFen;
    state.highestBidderId = input.userId;
    state.bidCount += 1;
    state.serverSeq += 1;
    state.acceptedClientBidIds.add(input.clientBidId);

    if (reachedCapPrice) {
      state.status = PrismaAuctionStatus.ENDED_SOLD;
    }

    return {
      accepted: true,
      auctionId: input.auction.id,
      amountFen: input.amountFen,
      previousPriceFen,
      currentPriceFen: input.amountFen,
      previousHighestBidderId,
      highestBidderId: input.userId,
      bidCount: state.bidCount,
      serverSeq: state.serverSeq,
      extended,
      newEndTimeMs,
      newExtendedCount: state.extendedCount,
      reachedCapPrice
    };
  }

  private getOrCreateState(input: AtomicBidInput) {
    const existing = this.states.get(input.auction.id);
    if (existing) {
      return existing;
    }

    const state = {
      status: input.auction.status,
      currentPriceFen: input.auction.currentPriceFen,
      highestBidderId: input.auction.highestBidderId,
      endTimeMs: input.auction.endTime?.getTime() ?? 0,
      bidCount: input.auction.bidCount,
      serverSeq: input.auction.serverSeq,
      extendedCount: input.auction.extendedCount,
      acceptedClientBidIds: new Set<string>()
    };

    this.states.set(input.auction.id, state);
    return state;
  }
}

class FakeStateMachine {
  constructor(private readonly prisma: FakePrisma) {}

  async settleSoldAuction(auctionId: string) {
    const auction = this.prisma.auctions.get(auctionId);
    assert.ok(auction);
    assert.equal(auction.status, PrismaAuctionStatus.RUNNING);
    assert.ok(auction.highestBidderId);

    const updated = {
      ...auction,
      status: PrismaAuctionStatus.ENDED_SOLD,
      version: auction.version + 1
    };
    const order: Order = {
      id: `order_${this.prisma.orders.size + 1}`,
      auctionId,
      itemId: auction.itemId,
      buyerId: auction.highestBidderId,
      amountFen: auction.currentPriceFen,
      status: PrismaOrderStatus.PENDING_PAYMENT,
      paidAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.prisma.orders.set(order.id, order);
    updated.order = order;
    this.prisma.auctions.set(auctionId, updated);

    return {
      auction: updated,
      order
    };
  }
}

class FakeScheduler {
  readonly scheduledAuctionIds: string[] = [];
  readonly clearedAuctionIds: string[] = [];

  scheduleEndTimer(auction: Pick<AuctionSession, "id">): void {
    this.scheduledAuctionIds.push(auction.id);
  }

  clearEndTimer(auctionId: string): void {
    this.clearedAuctionIds.push(auctionId);
  }
}

describe("BidService.placeBid", () => {
  it("accepts a zero-start first bid and writes an outbox event", async () => {
    const { prisma, service } = makeBidService();

    const result = await service.placeBid("auction_1", "user_1", {
      amountFen: 1000,
      clientBidId: "client_1"
    });

    const auction = prisma.auctions.get("auction_1");
    assert.equal(result.accepted, true);
    assert.equal(result.amountFen, 1000);
    assert.equal(result.currentPriceFen, 1000);
    assert.equal(result.highestBidderId, "user_1");
    assert.equal(result.idempotent, false);
    assert.equal(auction?.currentPriceFen, 1000);
    assert.equal(auction?.bidCount, 1);
    assert.equal(prisma.bids.size, 1);
    assert.equal(prisma.events.length, 1);
    assert.equal(prisma.events[0]?.type, PrismaAuctionEventType.BID_ACCEPTED);
  });

  it("rejects low, invalid-increment, repeated-leading, over-cap, and ended bids", async () => {
    const low = makeBidService();
    await assert.rejects(
      () =>
        low.service.placeBid("auction_1", "user_1", {
          amountFen: 0,
          clientBidId: "low"
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.BidAmountTooLow)
    );

    const invalidIncrement = makeBidService();
    await assert.rejects(
      () =>
        invalidIncrement.service.placeBid("auction_1", "user_1", {
          amountFen: 1500,
          clientBidId: "invalid_increment"
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.BidIncrementInvalid)
    );

    const leading = makeBidService();
    await leading.service.placeBid("auction_1", "user_1", {
      amountFen: 1000,
      clientBidId: "lead_1"
    });
    await assert.rejects(
      () =>
        leading.service.placeBid("auction_1", "user_1", {
          amountFen: 2000,
          clientBidId: "lead_2"
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.BidderAlreadyLeading)
    );

    const overCap = makeBidService();
    await assert.rejects(
      () =>
        overCap.service.placeBid("auction_1", "user_1", {
          amountFen: 101000,
          clientBidId: "over_cap"
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.BidExceedsCapPrice)
    );

    const ended = makeBidService({
      endTime: new Date(Date.now() - 1000)
    });
    await assert.rejects(
      () =>
        ended.service.placeBid("auction_1", "user_1", {
          amountFen: 1000,
          clientBidId: "ended"
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.AuctionAlreadyEnded)
    );
  });

  it("returns an idempotent result for an existing clientBidId", async () => {
    const { prisma, service } = makeBidService();

    const first = await service.placeBid("auction_1", "user_1", {
      amountFen: 1000,
      clientBidId: "same_client_bid"
    });
    const second = await service.placeBid("auction_1", "user_1", {
      amountFen: 1000,
      clientBidId: "same_client_bid"
    });

    assert.equal(first.bidId, second.bidId);
    assert.equal(second.idempotent, true);
    assert.equal(prisma.bids.size, 1);
  });

  it("extends the end time inside the anti-sniping window and reschedules the timer", async () => {
    const endTime = new Date(Date.now() + 5_000);
    const { prisma, scheduler, service } = makeBidService({
      endTime,
      rule: {
        antiSnipingWindowSeconds: 10,
        extensionSeconds: 15,
        maxExtensionCount: 2
      }
    });

    const result = await service.placeBid("auction_1", "user_1", {
      amountFen: 1000,
      clientBidId: "extend"
    });

    assert.equal(result.extended, true);
    assert.equal(prisma.auctions.get("auction_1")?.extendedCount, 1);
    assert.equal(
      prisma.auctions.get("auction_1")?.endTime?.getTime(),
      endTime.getTime() + 15_000
    );
    assert.deepEqual(scheduler.scheduledAuctionIds, ["auction_1"]);
  });

  it("settles immediately and creates exactly one order when a bid reaches capPriceFen", async () => {
    const { prisma, scheduler, service } = makeBidService();

    const result = await service.placeBid("auction_1", "user_1", {
      amountFen: 100000,
      clientBidId: "cap"
    });

    const auction = prisma.auctions.get("auction_1");
    assert.equal(result.reachedCapPrice, true);
    assert.equal(result.status, PrismaAuctionStatus.ENDED_SOLD);
    assert.equal(result.orderId, "order_1");
    assert.equal(auction?.status, PrismaAuctionStatus.ENDED_SOLD);
    assert.equal(prisma.orders.size, 1);
    assert.deepEqual(scheduler.clearedAuctionIds, ["auction_1"]);
  });

  it("accepts only one of several concurrent bids using the same clientBidId", async () => {
    const { prisma, service } = makeBidService();

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        service.placeBid("auction_1", `user_${index}`, {
          amountFen: 1000,
          clientBidId: "duplicate_client"
        })
      )
    );
    const accepted = attempts.filter((attempt) => attempt.status === "fulfilled");

    assert.equal(accepted.length, 1);
    assert.equal(prisma.bids.size, 1);
    assert.equal(prisma.auctions.get("auction_1")?.bidCount, 1);
  });

  it("keeps one winner and one order when concurrent users hit the cap price", async () => {
    const { prisma, service } = makeBidService();

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        service.placeBid("auction_1", `user_${index}`, {
          amountFen: 100000,
          clientBidId: `cap_${index}`
        })
      )
    );
    const accepted = attempts.filter((attempt) => attempt.status === "fulfilled");

    assert.equal(accepted.length, 1);
    assert.equal(prisma.bids.size, 1);
    assert.equal(prisma.orders.size, 1);
    assert.equal(prisma.auctions.get("auction_1")?.status, PrismaAuctionStatus.ENDED_SOLD);
  });

  it("keeps price monotonic and bidCount consistent for 30 concurrent bids", async () => {
    await assertConcurrentBids(30);
  });

  it("keeps price monotonic and bidCount consistent for 100 concurrent bids", async () => {
    await assertConcurrentBids(100);
  });
});

async function assertConcurrentBids(total: number): Promise<void> {
  const { prisma, service } = makeBidService({
    capPriceFen: 1_000_000
  });

  const attempts = await Promise.allSettled(
    Array.from({ length: total }, (_, index) =>
      service.placeBid("auction_1", `user_${index}`, {
        amountFen: (index + 1) * 1000,
        clientBidId: `client_${index}`
      })
    )
  );
  const accepted = attempts.filter(
    (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<BidService["placeBid"]>>> =>
      attempt.status === "fulfilled"
  );
  const acceptedAmounts = accepted.map((attempt) => attempt.value.amountFen);
  const finalAuction = prisma.auctions.get("auction_1");
  const maxAcceptedAmount = Math.max(...acceptedAmounts);
  const winner = accepted.find((attempt) => attempt.value.amountFen === maxAcceptedAmount);

  assert.ok(finalAuction);
  assert.equal(prisma.bids.size, accepted.length);
  assert.equal(finalAuction.bidCount, accepted.length);
  assert.equal(finalAuction.currentPriceFen, maxAcceptedAmount);
  assert.equal(finalAuction.highestBidderId, winner?.value.highestBidderId);
  assert.equal(prisma.orders.size, 0);

  const persistedAmounts = [...prisma.bids.values()]
    .sort((left, right) => left.serverSeq - right.serverSeq)
    .map((bid) => bid.amountFen);
  assert.deepEqual(
    persistedAmounts,
    [...persistedAmounts].sort((left, right) => left - right)
  );
}

function makeBidService(
  overrides: Omit<Partial<AuctionForBid>, "rule"> & {
    rule?: Partial<AuctionRule>;
  } = {}
) {
  const prisma = new FakePrisma();
  const rule = makeRule(overrides.rule);
  const auction = makeAuction({
    ...overrides,
    rule
  });
  prisma.auctions.set(auction.id, auction);

  const atomicStore = new FakeAtomicStore();
  const stateMachine = new FakeStateMachine(prisma);
  const scheduler = new FakeScheduler();
  const service = new BidService(
    prisma as unknown as PrismaService,
    atomicStore as unknown as RedisBidAtomicStore,
    stateMachine as unknown as AuctionStateMachineService,
    scheduler as unknown as AuctionSchedulerService
  );

  return {
    prisma,
    scheduler,
    service
  };
}

function makeAuction(overrides: Partial<AuctionForBid> = {}): AuctionForBid {
  const now = new Date();

  return {
    id: "auction_1",
    roomId: "room_1",
    itemId: "item_1",
    ruleId: "rule_1",
    status: PrismaAuctionStatus.RUNNING,
    startTime: new Date(now.getTime() - 60_000),
    endTime: new Date(now.getTime() + 60_000),
    startPriceFen: 0,
    currentPriceFen: 0,
    incrementFen: 1000,
    capPriceFen: 100000,
    highestBidderId: null,
    bidCount: 0,
    extendedCount: 0,
    serverSeq: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    rule: makeRule(),
    order: null,
    ...overrides
  };
}

function makeRule(overrides: Partial<AuctionRule> = {}): AuctionRule {
  const now = new Date();

  return {
    id: "rule_1",
    startPriceFen: 0,
    incrementFen: 1000,
    durationSeconds: 300,
    capPriceFen: 100000,
    antiSnipingWindowSeconds: 0,
    extensionSeconds: 0,
    maxExtensionCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function rejected(
  auctionId: string,
  code: AuctionErrorCode,
  state?: {
    currentPriceFen: number;
    highestBidderId: string | null;
    endTimeMs: number;
  }
): AtomicBidResult {
  return {
    accepted: false,
    auctionId,
    code,
    message: code,
    currentPriceFen: state?.currentPriceFen,
    highestBidderId: state?.highestBidderId,
    endTimeMs: state?.endTimeMs
  };
}

function hasApiCode(error: unknown, code: AuctionErrorCode): boolean {
  assert.ok(error instanceof ApiException);
  const response = error.getResponse() as {
    code: AuctionErrorCode;
  };

  assert.equal(response.code, code);
  return true;
}
