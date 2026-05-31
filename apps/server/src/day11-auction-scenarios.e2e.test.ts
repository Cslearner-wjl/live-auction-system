import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionEventType as PrismaAuctionEventType,
  AuctionStatus as PrismaAuctionStatus,
  BidStatus as PrismaBidStatus,
  LiveRoomStatus as PrismaLiveRoomStatus,
  OrderStatus as PrismaOrderStatus,
  OutboxStatus as PrismaOutboxStatus,
  UserRole as PrismaUserRole,
  type AuctionItem,
  type AuctionRule,
  type AuctionSession,
  type Bid,
  type LiveRoom,
  type Order,
  type User
} from "@prisma/client";
import { AuctionErrorCode, AuctionStatus } from "@live-auction/shared";
import { AdminAuctionsService } from "./admin/admin-auctions.service";
import { AdminItemsService } from "./admin/admin-items.service";
import { AdminOrdersService } from "./admin/admin-orders.service";
import { AuctionSchedulerService } from "./auction/auction-scheduler.service";
import { AuctionStateMachineService } from "./auction/auction-state-machine.service";
import { BidService } from "./bid/bid.service";
import {
  type AtomicBidInput,
  type AtomicBidResult,
  type AtomicBidRollbackInput,
  RedisBidAtomicStore
} from "./bid/bid-redis.store";
import { ApiException } from "./common/api-error";
import { PrismaService } from "./prisma/prisma.service";
import { AuctionSnapshotService } from "./realtime/auction-snapshot.service";

type AuctionWithRule = AuctionSession & {
  item?: AuctionItem;
  rule: AuctionRule;
  highestBidder?: Pick<User, "id" | "maskedName"> | null;
  order?: Order | null;
};

interface EventRecord {
  id: string;
  auctionId: string;
  roomId: string;
  type: PrismaAuctionEventType;
  serverSeq: number;
  payload: Record<string, unknown>;
  outboxStatus: PrismaOutboxStatus;
  publishedAt: Date | null;
  createdAt: Date;
}

describe("Day 11 auction e2e scenarios", () => {
  it("settles a no-bid auction as unsold without creating orders", async () => {
    const harness = makeHarness();
    const auction = await createRunningAuction(harness);
    setAuctionEndTime(harness.prisma, auction.id, new Date(Date.now() - 1000));

    const result = await harness.stateMachine.finishAuction(auction.id);
    const orderList = await harness.orders.listOrders({ page: "1", pageSize: "20" });

    assert.equal(result.auction.status, PrismaAuctionStatus.ENDED_UNSOLD);
    assert.equal(result.order, null);
    assert.equal(orderList.page.total, 0);
    assert.deepEqual(eventTypes(harness.prisma), [
      PrismaAuctionEventType.AUCTION_STARTED,
      PrismaAuctionEventType.AUCTION_ENDED
    ]);
  });

  it("settles a one-bid auction as sold and exposes the latest reconnect snapshot", async () => {
    const harness = makeHarness();
    const auction = await createRunningAuction(harness);

    const bid = await harness.bids.placeBid(auction.id, "user_1", {
      amountFen: 1000,
      clientBidId: "one_bid"
    });
    setAuctionEndTime(harness.prisma, auction.id, new Date(Date.now() - 1000));

    const result = await harness.stateMachine.finishAuction(auction.id);
    const snapshot = await harness.snapshots.getSnapshot(auction.id, "user_1");

    assert.equal(bid.accepted, true);
    assert.equal(result.auction.status, PrismaAuctionStatus.ENDED_SOLD);
    assert.equal(result.order?.buyerId, "user_1");
    assert.equal(result.order?.amountFen, 1000);
    assert.equal(harness.prisma.orders.size, 1);
    assert.equal(snapshot.status, AuctionStatus.EndedSold);
    assert.equal(snapshot.currentPriceFen, 1000);
    assert.equal(snapshot.myRank, 1);
    assert.equal(snapshot.highestBidderMaskedName, "张**");
  });

  it("keeps consecutive multi-user bids monotonic, extends near the end, and restores snapshot state", async () => {
    const harness = makeHarness();
    const auction = await createRunningAuction(harness, {
      antiSnipingWindowSeconds: 10,
      extensionSeconds: 15,
      maxExtensionCount: 2
    });
    const nearEnd = new Date(Date.now() + 5000);
    setAuctionEndTime(harness.prisma, auction.id, nearEnd);

    const first = await harness.bids.placeBid(auction.id, "user_1", {
      amountFen: 1000,
      clientBidId: "near_end_first"
    });
    await assert.rejects(
      () =>
        harness.bids.placeBid(auction.id, "user_1", {
          amountFen: 2000,
          clientBidId: "already_leading"
        }),
      (error: unknown) =>
        hasApiCode(error, AuctionErrorCode.BidderAlreadyLeading, "当前您已是最高价")
    );
    const second = await harness.bids.placeBid(auction.id, "user_2", {
      amountFen: 2000,
      clientBidId: "outbid_second"
    });
    const user1Snapshot = await harness.snapshots.getSnapshot(auction.id, "user_1");
    const user2Snapshot = await harness.snapshots.getSnapshot(auction.id, "user_2");

    assert.equal(first.extended, true);
    assert.equal(first.endTime, new Date(nearEnd.getTime() + 15_000).toISOString());
    assert.equal(second.currentPriceFen, 2000);
    assert.equal(harness.prisma.auctions.get(auction.id)?.currentPriceFen, 2000);
    assert.equal(harness.prisma.auctions.get(auction.id)?.highestBidderId, "user_2");
    assert.equal(harness.prisma.auctions.get(auction.id)?.bidCount, 2);
    assert.deepEqual(
      [...harness.prisma.bids.values()]
        .sort((left, right) => left.serverSeq - right.serverSeq)
        .map((bid) => bid.amountFen),
      [1000, 2000]
    );
    assert.equal(user1Snapshot.currentPriceFen, 2000);
    assert.equal(user1Snapshot.highestBidderMaskedName, "李**");
    assert.equal(user1Snapshot.myRank, 2);
    assert.equal(user2Snapshot.myRank, 1);
    assert.equal(user2Snapshot.participantCount, 2);
    assert.deepEqual(harness.scheduler.scheduledAuctionIds, [auction.id, auction.id]);
  });

  it("settles immediately at cap price, creates one order, and rejects later bids", async () => {
    const harness = makeHarness();
    const auction = await createRunningAuction(harness, {
      capPriceFen: 2000
    });

    await harness.bids.placeBid(auction.id, "user_1", {
      amountFen: 1000,
      clientBidId: "below_cap"
    });
    const cap = await harness.bids.placeBid(auction.id, "user_2", {
      amountFen: 2000,
      clientBidId: "at_cap"
    });

    assert.equal(cap.reachedCapPrice, true);
    assert.equal(cap.status, AuctionStatus.EndedSold);
    assert.equal(harness.prisma.auctions.get(auction.id)?.status, PrismaAuctionStatus.ENDED_SOLD);
    assert.equal(harness.prisma.orders.size, 1);
    assert.deepEqual(harness.scheduler.clearedAuctionIds, [auction.id]);

    await assert.rejects(
      () =>
        harness.bids.placeBid(auction.id, "user_3", {
          amountFen: 3000,
          clientBidId: "after_cap"
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.AuctionAlreadyEnded)
    );
  });

  it("cancels a running auction, writes cancellation event, and rejects bids", async () => {
    const harness = makeHarness();
    const auction = await createRunningAuction(harness);

    const cancelled = await harness.auctions.cancelAuction(auction.id, {
      reason: "商品状态异常"
    });

    assert.equal(cancelled.status, AuctionStatus.Cancelled);
    assert.equal(harness.prisma.auctions.get(auction.id)?.status, PrismaAuctionStatus.CANCELLED);
    assert.deepEqual(harness.scheduler.clearedAuctionIds, [auction.id]);
    assert.equal(lastEvent(harness.prisma)?.type, PrismaAuctionEventType.AUCTION_CANCELLED);

    await assert.rejects(
      () =>
        harness.bids.placeBid(auction.id, "user_1", {
          amountFen: 1000,
          clientBidId: "after_cancel"
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.AuctionCancelled)
    );
  });

  it("returns an idempotent result for repeated clicks with the same clientBidId", async () => {
    const harness = makeHarness();
    const auction = await createRunningAuction(harness);

    const first = await harness.bids.placeBid(auction.id, "user_1", {
      amountFen: 1000,
      clientBidId: "double_click"
    });
    const repeated = await harness.bids.placeBid(auction.id, "user_1", {
      amountFen: 1000,
      clientBidId: "double_click"
    });

    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.bidId, first.bidId);
    assert.equal(harness.prisma.bids.size, 1);
    assert.equal(
      eventTypes(harness.prisma).filter((type) => type === PrismaAuctionEventType.BID_ACCEPTED)
        .length,
      1
    );
  });
});

function makeHarness() {
  const prisma = new Day11Prisma();
  const stateMachine = new AuctionStateMachineService(prisma as unknown as PrismaService);
  const scheduler = new Day11Scheduler();
  const items = new AdminItemsService(prisma as unknown as PrismaService);
  const auctions = new AdminAuctionsService(
    prisma as unknown as PrismaService,
    stateMachine,
    scheduler as unknown as AuctionSchedulerService
  );
  const bids = new BidService(
    prisma as unknown as PrismaService,
    new Day11AtomicStore() as unknown as RedisBidAtomicStore,
    stateMachine,
    scheduler as unknown as AuctionSchedulerService
  );
  const snapshots = new AuctionSnapshotService(prisma as unknown as PrismaService);
  const orders = new AdminOrdersService(prisma as unknown as PrismaService);

  return {
    prisma,
    stateMachine,
    scheduler,
    items,
    auctions,
    bids,
    snapshots,
    orders
  };
}

async function createRunningAuction(
  harness: ReturnType<typeof makeHarness>,
  ruleOverrides: Partial<
    Pick<
      AuctionRule,
      | "startPriceFen"
      | "incrementFen"
      | "durationSeconds"
      | "capPriceFen"
      | "antiSnipingWindowSeconds"
      | "extensionSeconds"
      | "maxExtensionCount"
    >
  > = {}
) {
  const item = await harness.items.createItem(
    {
      name: `Day11 场景商品 ${harness.prisma.items.size + 1}`,
      imageUrl: "https://example.com/day11.png",
      description: "用于 Day11 端到端异常场景自动化验证",
      sellingPoints: ["端到端", "异常覆盖"]
    },
    "admin_1"
  );
  const scheduled = await harness.auctions.createAuction({
    roomId: "room_1",
    itemId: item.id,
    startPriceFen: ruleOverrides.startPriceFen ?? 0,
    incrementFen: ruleOverrides.incrementFen ?? 1000,
    durationSeconds: ruleOverrides.durationSeconds ?? 60,
    capPriceFen: ruleOverrides.capPriceFen ?? 100000,
    antiSnipingWindowSeconds: ruleOverrides.antiSnipingWindowSeconds ?? 0,
    extensionSeconds: ruleOverrides.extensionSeconds ?? 0,
    maxExtensionCount: ruleOverrides.maxExtensionCount ?? 0
  });

  return harness.auctions.startAuction(scheduled.id);
}

function setAuctionEndTime(prisma: Day11Prisma, auctionId: string, endTime: Date): void {
  const auction = prisma.auctions.get(auctionId);
  assert.ok(auction);
  prisma.auctions.set(auctionId, {
    ...auction,
    endTime
  });
}

class Day11Prisma {
  readonly users = new Map<string, User>([
    ["admin_1", makeUser("admin_1", "主播", "主**", PrismaUserRole.ADMIN)],
    ["user_1", makeUser("user_1", "张三", "张**", PrismaUserRole.BIDDER)],
    ["user_2", makeUser("user_2", "李四", "李**", PrismaUserRole.BIDDER)],
    ["user_3", makeUser("user_3", "王五", "王**", PrismaUserRole.BIDDER)]
  ]);
  readonly rooms = new Map<string, LiveRoom>([
    [
      "room_1",
      {
        id: "room_1",
        title: "Day11 直播间",
        hostUserId: "admin_1",
        status: PrismaLiveRoomStatus.LIVE,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);
  readonly items = new Map<string, AuctionItem>();
  readonly rules = new Map<string, AuctionRule>();
  readonly auctions = new Map<string, AuctionWithRule>();
  readonly bids = new Map<string, Bid>();
  readonly orders = new Map<string, Order>();
  readonly events = new Map<string, EventRecord>();
  readonly auditLogs: Array<Record<string, unknown>> = [];

  readonly user = {
    findUnique: async ({ where }: { where: { id: string } }) => this.users.get(where.id) ?? null
  };

  readonly liveRoom = {
    findUnique: async ({ where }: { where: { id: string } }) => this.rooms.get(where.id) ?? null
  };

  readonly auctionItem = {
    create: async ({ data }: { data: Omit<AuctionItem, "id" | "createdAt" | "updatedAt"> }) => {
      const now = new Date();
      const item: AuctionItem = {
        id: `item_${this.items.size + 1}`,
        name: data.name,
        imageUrl: data.imageUrl,
        description: data.description,
        sellingPoints: data.sellingPoints,
        createdById: data.createdById,
        createdAt: now,
        updatedAt: now
      };
      this.items.set(item.id, item);
      return item;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.items.get(where.id) ?? null
  };

  readonly auctionRule = {
    create: async ({ data }: { data: Omit<AuctionRule, "id" | "createdAt" | "updatedAt"> }) => {
      const now = new Date();
      const rule: AuctionRule = {
        id: `rule_${this.rules.size + 1}`,
        startPriceFen: data.startPriceFen,
        incrementFen: data.incrementFen,
        durationSeconds: data.durationSeconds,
        capPriceFen: data.capPriceFen,
        antiSnipingWindowSeconds: data.antiSnipingWindowSeconds,
        extensionSeconds: data.extensionSeconds,
        maxExtensionCount: data.maxExtensionCount,
        createdAt: now,
        updatedAt: now
      };
      this.rules.set(rule.id, rule);
      return rule;
    }
  };

  readonly auctionSession = {
    create: async ({
      data
    }: {
      data: {
        roomId: string;
        itemId: string;
        ruleId: string;
        status: PrismaAuctionStatus;
        startPriceFen: number;
        currentPriceFen: number;
        incrementFen: number;
        capPriceFen: number;
      };
    }) => {
      const now = new Date();
      const rule = this.rules.get(data.ruleId);
      assert.ok(rule);
      const auction: AuctionWithRule = {
        id: `auction_${this.auctions.size + 1}`,
        roomId: data.roomId,
        itemId: data.itemId,
        ruleId: data.ruleId,
        status: data.status,
        startTime: null,
        endTime: null,
        startPriceFen: data.startPriceFen,
        currentPriceFen: data.currentPriceFen,
        incrementFen: data.incrementFen,
        capPriceFen: data.capPriceFen,
        highestBidderId: null,
        bidCount: 0,
        extendedCount: 0,
        serverSeq: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
        item: this.items.get(data.itemId),
        rule,
        highestBidder: null,
        order: null
      };
      this.auctions.set(auction.id, auction);
      return withAuctionRelations(auction, this);
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const auction = this.auctions.get(where.id);
      return auction ? withAuctionRelations(auction, this) : null;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const auction = this.auctions.get(where.id);
      assert.ok(auction);
      return withAuctionRelations(auction, this);
    },
    findMany: async ({
      where
    }: {
      where?: { roomId?: string; status?: PrismaAuctionStatus | { in: PrismaAuctionStatus[] } };
    }) =>
      [...this.auctions.values()]
        .filter((auction) => !where?.roomId || auction.roomId === where.roomId)
        .filter((auction) => !where?.status || matchesStatus(auction.status, where.status))
        .map((auction) => withAuctionRelations(auction, this))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    count: async ({ where }: { where?: { status?: PrismaAuctionStatus } } = {}) =>
      [...this.auctions.values()].filter(
        (auction) => !where?.status || auction.status === where.status
      ).length,
    updateMany: async ({
      where,
      data
    }: {
      where: {
        id: string;
        status?: PrismaAuctionStatus | { in: PrismaAuctionStatus[] };
        serverSeq?: { lt: number };
      };
      data: Partial<AuctionSession> & { version?: { increment: number } };
    }) => {
      const auction = this.auctions.get(where.id);
      if (!auction || (where.status && !matchesStatus(auction.status, where.status))) {
        return { count: 0 };
      }

      if (where.serverSeq && auction.serverSeq >= where.serverSeq.lt) {
        return { count: 0 };
      }

      this.auctions.set(where.id, {
        ...auction,
        ...data,
        item: this.items.get(auction.itemId),
        rule: auction.rule,
        highestBidder: data.highestBidderId
          ? this.users.get(data.highestBidderId)
          : auction.highestBidder,
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
      where: { auctionId_clientBidId: { auctionId: string; clientBidId: string } };
    }) =>
      [...this.bids.values()].find(
        (bid) =>
          bid.auctionId === where.auctionId_clientBidId.auctionId &&
          bid.clientBidId === where.auctionId_clientBidId.clientBidId
      ) ?? null,
    findMany: async ({
      where,
      include,
      select,
      distinct
    }: {
      where: { auctionId: string; status: PrismaBidStatus };
      include?: { user?: unknown };
      select?: { userId?: boolean };
      distinct?: string[];
    }) => {
      const bids = [...this.bids.values()]
        .filter((bid) => bid.auctionId === where.auctionId && bid.status === where.status)
        .sort((left, right) => {
          if (right.amountFen !== left.amountFen) {
            return right.amountFen - left.amountFen;
          }
          return left.createdAt.getTime() - right.createdAt.getTime();
        });

      if (distinct?.includes("userId")) {
        const seenUserIds = new Set<string>();
        return bids
          .filter((bid) => {
            if (seenUserIds.has(bid.userId)) {
              return false;
            }
            seenUserIds.add(bid.userId);
            return true;
          })
          .map((bid) => (select?.userId ? { userId: bid.userId } : bid));
      }

      if (include?.user) {
        return bids.map((bid) => ({
          ...bid,
          user: this.users.get(bid.userId)
        }));
      }

      if (select?.userId) {
        return bids.map((bid) => ({ userId: bid.userId }));
      }

      return bids;
    },
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
    }) => {
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

  readonly order = {
    create: async ({
      data
    }: {
      data: {
        auctionId: string;
        itemId: string;
        buyerId: string;
        amountFen: number;
        status: PrismaOrderStatus;
      };
    }) => {
      if ([...this.orders.values()].some((order) => order.auctionId === data.auctionId)) {
        throw new Error(`Order for auction ${data.auctionId} already exists`);
      }

      const now = new Date();
      const order: Order = {
        id: `order_${this.orders.size + 1}`,
        auctionId: data.auctionId,
        itemId: data.itemId,
        buyerId: data.buyerId,
        amountFen: data.amountFen,
        status: data.status,
        paidAt: null,
        createdAt: now,
        updatedAt: now
      };
      this.orders.set(order.id, order);
      const auction = this.auctions.get(order.auctionId);
      if (auction) {
        auction.order = order;
      }
      return order;
    },
    findMany: async ({ where }: { where?: { status?: PrismaOrderStatus } } = {}) =>
      [...this.orders.values()]
        .filter((order) => !where?.status || order.status === where.status)
        .map((order) => ({
          ...order,
          item: this.items.get(order.itemId),
          buyer: this.users.get(order.buyerId),
          auction: this.auctions.get(order.auctionId)
        })),
    findUnique: async ({ where }: { where: { id: string } }) => {
      const order = this.orders.get(where.id);
      return order
        ? {
            ...order,
            item: this.items.get(order.itemId),
            buyer: this.users.get(order.buyerId),
            auction: this.auctions.get(order.auctionId)
          }
        : null;
    },
    count: async ({ where }: { where?: { status?: PrismaOrderStatus } } = {}) =>
      [...this.orders.values()].filter((order) => !where?.status || order.status === where.status)
        .length
  };

  readonly auctionEvent = {
    create: async ({
      data
    }: {
      data: {
        auctionId: string;
        roomId: string;
        type: PrismaAuctionEventType;
        serverSeq: number;
        payload: Record<string, unknown>;
        outboxStatus: PrismaOutboxStatus;
      };
    }) => {
      const event: EventRecord = {
        id: `event_${this.events.size + 1}`,
        auctionId: data.auctionId,
        roomId: data.roomId,
        type: data.type,
        serverSeq: data.serverSeq,
        payload: data.payload,
        outboxStatus: data.outboxStatus,
        publishedAt: null,
        createdAt: new Date()
      };
      this.events.set(event.id, event);
      return event;
    }
  };

  readonly auditLog = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.auditLogs.push(data);
      return { id: `audit_${this.auditLogs.length}`, ...data };
    }
  };

  async $transaction<T>(operation: ((tx: this) => Promise<T>) | Array<Promise<unknown>>): Promise<T> {
    if (Array.isArray(operation)) {
      return (await Promise.all(operation)) as T;
    }

    return operation(this);
  }
}

class Day11AtomicStore {
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
      return rejected(input.auction.id, AuctionErrorCode.DuplicateClientBid, state);
    }

    if (state.status !== PrismaAuctionStatus.RUNNING) {
      return rejected(input.auction.id, AuctionErrorCode.AuctionAlreadyEnded, state);
    }

    if (input.now.getTime() > state.endTimeMs) {
      return rejected(input.auction.id, AuctionErrorCode.AuctionAlreadyEnded, state);
    }

    if (state.highestBidderId === input.userId) {
      return rejected(input.auction.id, AuctionErrorCode.BidderAlreadyLeading, state);
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
    const previousEndTimeMs = state.endTimeMs;
    const previousExtendedCount = state.extendedCount;
    const previousBidCount = state.bidCount;
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
      previousEndTimeMs,
      previousExtendedCount,
      previousBidCount,
      previousUserLeaderboardAmountFen: null,
      highestBidderId: input.userId,
      bidCount: state.bidCount,
      serverSeq: state.serverSeq,
      extended,
      newEndTimeMs,
      newExtendedCount: state.extendedCount,
      reachedCapPrice
    };
  }

  async rollbackAcceptedBid(_input: AtomicBidRollbackInput): Promise<boolean> {
    return true;
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

class Day11Scheduler {
  readonly scheduledAuctionIds: string[] = [];
  readonly clearedAuctionIds: string[] = [];

  scheduleEndTimer(auction: Pick<AuctionSession, "id">): void {
    this.scheduledAuctionIds.push(auction.id);
  }

  clearEndTimer(auctionId: string): void {
    this.clearedAuctionIds.push(auctionId);
  }
}

function withAuctionRelations(auction: AuctionWithRule, prisma: Day11Prisma) {
  return {
    ...auction,
    item: prisma.items.get(auction.itemId),
    rule: prisma.rules.get(auction.ruleId) ?? auction.rule,
    highestBidder: auction.highestBidderId ? prisma.users.get(auction.highestBidderId) : null,
    order: auction.order ?? null
  };
}

function matchesStatus(
  actual: PrismaAuctionStatus,
  expected: PrismaAuctionStatus | { in: PrismaAuctionStatus[] }
): boolean {
  return typeof expected === "string" ? actual === expected : expected.in.includes(actual);
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

function eventTypes(prisma: Day11Prisma): PrismaAuctionEventType[] {
  return [...prisma.events.values()].map((event) => event.type);
}

function lastEvent(prisma: Day11Prisma): EventRecord | undefined {
  return [...prisma.events.values()].at(-1);
}

function hasApiCode(error: unknown, code: AuctionErrorCode, message?: string): boolean {
  assert.ok(error instanceof ApiException);
  const response = error.getResponse() as {
    code: AuctionErrorCode;
    message: string;
  };

  assert.equal(response.code, code);
  if (message) {
    assert.equal(response.message, message);
  }
  return true;
}

function makeUser(
  id: string,
  displayName: string,
  maskedName: string,
  role: PrismaUserRole
): User {
  const now = new Date();

  return {
    id,
    displayName,
    maskedName,
    role,
    createdAt: now,
    updatedAt: now
  };
}
