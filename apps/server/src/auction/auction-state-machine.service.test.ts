import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionEventType as PrismaAuctionEventType,
  AuctionStatus as PrismaAuctionStatus,
  OrderStatus as PrismaOrderStatus,
  OutboxStatus as PrismaOutboxStatus,
  type AuctionEvent,
  type AuctionSession,
  type Order
} from "@prisma/client";
import { AuctionErrorCode, AuctionStatus } from "@live-auction/shared";
import { ApiException } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";
import {
  AuctionStateMachineService,
  assertAuctionTransition
} from "./auction-state-machine.service";

interface FindAuctionArgs {
  where: {
    id: string;
  };
}

interface UpdateAuctionManyArgs {
  where: {
    id: string;
    status?: PrismaAuctionStatus | { in: PrismaAuctionStatus[] };
  };
  data: {
    status?: PrismaAuctionStatus;
    startTime?: Date;
    endTime?: Date;
    serverSeq?: number;
    version?: {
      increment: number;
    };
  };
}

interface CreateOrderArgs {
  data: {
    auctionId: string;
    itemId: string;
    buyerId: string;
    amountFen: number;
    status: PrismaOrderStatus;
  };
}

class FakePrisma {
  readonly auctions = new Map<string, AuctionSession>();
  readonly orders = new Map<string, Order>();
  readonly events = new Map<string, AuctionEvent>();

  readonly auctionSession = {
    findUnique: async ({ where }: FindAuctionArgs): Promise<AuctionSession | null> =>
      this.auctions.get(where.id) ?? null,
    findUniqueOrThrow: async ({ where }: FindAuctionArgs): Promise<AuctionSession> => {
      const auction = this.auctions.get(where.id);

      if (!auction) {
        throw new Error(`Auction ${where.id} not found`);
      }

      return auction;
    },
    updateMany: async ({ where, data }: UpdateAuctionManyArgs): Promise<{ count: number }> => {
      const auction = this.auctions.get(where.id);

      if (!auction || !matchesStatus(auction.status, where.status)) {
        return { count: 0 };
      }

      this.auctions.set(where.id, {
        ...auction,
        status: data.status ?? auction.status,
        startTime: data.startTime ?? auction.startTime,
        endTime: data.endTime ?? auction.endTime,
        serverSeq: data.serverSeq ?? auction.serverSeq,
        version: auction.version + (data.version?.increment ?? 0)
      });

      return { count: 1 };
    }
  };

  readonly order = {
    create: async ({ data }: CreateOrderArgs): Promise<Order> => {
      if ([...this.orders.values()].some((order) => order.auctionId === data.auctionId)) {
        throw new Error(`Order for auction ${data.auctionId} already exists`);
      }

      const now = new Date("2026-06-01T10:00:01.000Z");
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
      return order;
    }
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
        payload: unknown;
        outboxStatus: PrismaOutboxStatus;
      };
    }): Promise<AuctionEvent> => {
      if (
        [...this.events.values()].some(
          (event) => event.auctionId === data.auctionId && event.serverSeq === data.serverSeq
        )
      ) {
        throw new Error(`Duplicate event seq ${data.auctionId}:${data.serverSeq}`);
      }

      const event: AuctionEvent = {
        id: `event_${this.events.size + 1}`,
        auctionId: data.auctionId,
        roomId: data.roomId,
        type: data.type,
        serverSeq: data.serverSeq,
        payload: data.payload as never,
        outboxStatus: data.outboxStatus,
        publishedAt: null,
        createdAt: new Date("2026-06-01T10:00:01.000Z")
      };

      this.events.set(event.id, event);
      return event;
    }
  };

  async $transaction<T>(operation: (tx: this) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

describe("auction state transitions", () => {
  it("allows scheduled auctions to start", () => {
    assert.doesNotThrow(() =>
      assertAuctionTransition(
        AuctionStatus.Scheduled,
        AuctionStatus.Running,
        "auction_1"
      )
    );
  });

  it("allows scheduled and running auctions to be cancelled", () => {
    assert.doesNotThrow(() =>
      assertAuctionTransition(
        AuctionStatus.Scheduled,
        AuctionStatus.Cancelled,
        "auction_1"
      )
    );
    assert.doesNotThrow(() =>
      assertAuctionTransition(
        AuctionStatus.Running,
        AuctionStatus.Cancelled,
        "auction_1"
      )
    );
  });

  it("rejects invalid transitions", () => {
    try {
      assertAuctionTransition(
        AuctionStatus.Running,
        AuctionStatus.Scheduled,
        "auction_1"
      );
    } catch (error: unknown) {
      assert.ok(error instanceof ApiException);
      const response = error.getResponse() as {
        code: AuctionErrorCode;
        details?: Record<string, unknown>;
      };
      assert.equal(response.code, AuctionErrorCode.InvalidAuctionTransition);
      assert.equal(response.details?.from, AuctionStatus.Running);
      assert.equal(response.details?.to, AuctionStatus.Scheduled);
      return;
    }

    assert.fail("Expected invalid transition to throw");
  });
});

describe("AuctionStateMachineService.finishAuction", () => {
  it("cancels a scheduled auction and writes a cancellation outbox event", async () => {
    const prisma = new FakePrisma();
    prisma.auctions.set(
      "auction_1",
      makeAuction({
        status: PrismaAuctionStatus.SCHEDULED,
        startTime: null,
        endTime: null
      })
    );
    const service = new AuctionStateMachineService(prisma as unknown as PrismaService);

    const result = await service.cancelAuction("auction_1", {
      now: new Date("2026-06-01T09:58:00.000Z"),
      reason: "商品状态异常"
    });

    assert.equal(result.status, PrismaAuctionStatus.CANCELLED);
    assert.equal(result.serverSeq, 1);
    assert.equal(prisma.events.size, 1);
    const event = [...prisma.events.values()][0];
    assert.equal(event?.type, PrismaAuctionEventType.AUCTION_CANCELLED);
    assert.equal(event?.serverSeq, 1);
  });

  it("settles a running auction with a highest bidder as sold and creates one order", async () => {
    const prisma = new FakePrisma();
    prisma.auctions.set(
      "auction_1",
      makeAuction({
        highestBidderId: "user_1",
        currentPriceFen: 90000
      })
    );
    const service = new AuctionStateMachineService(prisma as unknown as PrismaService);

    const result = await service.finishAuction("auction_1", {
      now: new Date("2026-06-01T10:00:01.000Z")
    });

    assert.equal(result.auction.status, PrismaAuctionStatus.ENDED_SOLD);
    assert.equal(result.order?.auctionId, "auction_1");
    assert.equal(result.order?.buyerId, "user_1");
    assert.equal(result.order?.amountFen, 90000);
    assert.equal(prisma.orders.size, 1);
    assert.equal(prisma.events.size, 2);
    assert.deepEqual(
      [...prisma.events.values()].map((event) => event.type),
      [PrismaAuctionEventType.AUCTION_ENDED, PrismaAuctionEventType.ORDER_CREATED]
    );
  });

  it("settles a running auction without bids as unsold and does not create orders", async () => {
    const prisma = new FakePrisma();
    prisma.auctions.set("auction_1", makeAuction());
    const service = new AuctionStateMachineService(prisma as unknown as PrismaService);

    const result = await service.finishAuction("auction_1", {
      now: new Date("2026-06-01T10:00:01.000Z")
    });

    assert.equal(result.auction.status, PrismaAuctionStatus.ENDED_UNSOLD);
    assert.equal(result.order, null);
    assert.equal(prisma.orders.size, 0);
    assert.equal(prisma.events.size, 1);
    assert.equal([...prisma.events.values()][0]?.type, PrismaAuctionEventType.AUCTION_ENDED);
  });

  it("rejects finishing before endTime", async () => {
    const prisma = new FakePrisma();
    prisma.auctions.set(
      "auction_1",
      makeAuction({
        endTime: new Date("2026-06-01T10:00:30.000Z")
      })
    );
    const service = new AuctionStateMachineService(prisma as unknown as PrismaService);

    await assert.rejects(
      () =>
        service.finishAuction("auction_1", {
          now: new Date("2026-06-01T10:00:01.000Z")
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.InvalidAuctionTransition)
    );
  });

  it("rejects repeated finish and does not create a duplicate order", async () => {
    const prisma = new FakePrisma();
    prisma.auctions.set(
      "auction_1",
      makeAuction({
        highestBidderId: "user_1",
        currentPriceFen: 90000
      })
    );
    const service = new AuctionStateMachineService(prisma as unknown as PrismaService);

    await service.finishAuction("auction_1", {
      now: new Date("2026-06-01T10:00:01.000Z")
    });

    await assert.rejects(
      () =>
        service.finishAuction("auction_1", {
          now: new Date("2026-06-01T10:00:02.000Z")
        }),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.InvalidAuctionTransition)
    );
    assert.equal(prisma.orders.size, 1);
  });

  it("does not mutate an auction when forced sold settlement has no highest bidder", async () => {
    const prisma = new FakePrisma();
    prisma.auctions.set("auction_1", makeAuction());
    const service = new AuctionStateMachineService(prisma as unknown as PrismaService);

    await assert.rejects(
      () => service.settleSoldAuction("auction_1"),
      (error: unknown) => hasApiCode(error, AuctionErrorCode.InvalidAuctionTransition)
    );

    assert.equal(prisma.auctions.get("auction_1")?.status, PrismaAuctionStatus.RUNNING);
    assert.equal(prisma.orders.size, 0);
  });
});

function makeAuction(overrides: Partial<AuctionSession> = {}): AuctionSession {
  const now = new Date("2026-06-01T09:59:00.000Z");

  return {
    id: "auction_1",
    roomId: "room_1",
    itemId: "item_1",
    ruleId: "rule_1",
    status: PrismaAuctionStatus.RUNNING,
    startTime: new Date("2026-06-01T09:55:00.000Z"),
    endTime: new Date("2026-06-01T10:00:00.000Z"),
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
    ...overrides
  };
}

function matchesStatus(
  current: PrismaAuctionStatus,
  expected: PrismaAuctionStatus | { in: PrismaAuctionStatus[] } | undefined
): boolean {
  if (!expected) {
    return true;
  }

  if (typeof expected === "string") {
    return current === expected;
  }

  return expected.in.includes(current);
}

function hasApiCode(error: unknown, code: AuctionErrorCode): boolean {
  assert.ok(error instanceof ApiException);
  const response = error.getResponse() as {
    code: AuctionErrorCode;
  };

  assert.equal(response.code, code);
  return true;
}
