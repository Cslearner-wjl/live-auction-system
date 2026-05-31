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
import { AuctionStatus, AuctionWebSocketEvent } from "@live-auction/shared";
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
import { PrismaService } from "./prisma/prisma.service";
import { AuctionSnapshotService } from "./realtime/auction-snapshot.service";

type AuctionWithRule = AuctionSession & { rule: AuctionRule; order?: Order | null };

describe("Day 10 core auction loop", () => {
  it("creates, starts, exposes, bids, settles, and lists the sold order", async () => {
    const prisma = new Day10Prisma();
    const stateMachine = new AuctionStateMachineService(prisma as unknown as PrismaService);
    const scheduler = new Day10Scheduler();
    const items = new AdminItemsService(prisma as unknown as PrismaService);
    const auctions = new AdminAuctionsService(
      prisma as unknown as PrismaService,
      stateMachine,
      scheduler as unknown as AuctionSchedulerService
    );
    const bids = new BidService(
      prisma as unknown as PrismaService,
      new Day10AtomicStore() as unknown as RedisBidAtomicStore,
      stateMachine,
      scheduler as unknown as AuctionSchedulerService
    );
    const snapshots = new AuctionSnapshotService(prisma as unknown as PrismaService);
    const orders = new AdminOrdersService(prisma as unknown as PrismaService);

    const item = await items.createItem(
      {
        name: "Day10 闭环手镯",
        imageUrl: "https://example.com/day10.png",
        description: "用于 Day10 核心闭环自动化验证",
        sellingPoints: ["0元起拍", "支持鉴定"]
      },
      "admin_1"
    );
    const scheduled = await auctions.createAuction({
      roomId: "room_1",
      itemId: item.id,
      startPriceFen: 0,
      incrementFen: 1000,
      durationSeconds: 60,
      capPriceFen: 1000,
      antiSnipingWindowSeconds: 10,
      extensionSeconds: 15,
      maxExtensionCount: 2
    });

    assert.equal(scheduled.status, AuctionStatus.Scheduled);
    assert.equal(scheduled.currentPriceFen, 0);

    const running = await auctions.startAuction(scheduled.id);
    const roomAuctions = await snapshots.listRoomAuctions("room_1");

    assert.equal(running.status, AuctionStatus.Running);
    assert.equal(scheduler.scheduledAuctionIds.at(-1), scheduled.id);
    assert.ok(roomAuctions.items.some((entry) => entry.auctionId === scheduled.id));

    const bid = await bids.placeBid(scheduled.id, "user_1", {
      amountFen: 1000,
      clientBidId: "day10-e2e-bid"
    });
    const orderList = await orders.listOrders({ page: "1", pageSize: "20" });

    assert.equal(bid.reachedCapPrice, true);
    assert.equal(bid.status, AuctionStatus.EndedSold);
    assert.equal(orderList.page.total, 1);
    assert.equal(orderList.items[0]?.auctionId, scheduled.id);
    assert.equal(orderList.items[0]?.amountFen, 1000);
    assert.equal(orderList.items[0]?.buyerMaskedName, "张**");
    assert.deepEqual(
      prisma.events.map((event) => event.type),
      [
        PrismaAuctionEventType.AUCTION_STARTED,
        PrismaAuctionEventType.BID_ACCEPTED,
        PrismaAuctionEventType.AUCTION_ENDED,
        PrismaAuctionEventType.ORDER_CREATED
      ]
    );
  });
});

class Day10Prisma {
  readonly users = new Map<string, User>([
    [
      "admin_1",
      {
        id: "admin_1",
        displayName: "主播",
        maskedName: "主**",
        role: PrismaUserRole.ADMIN,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    [
      "user_1",
      {
        id: "user_1",
        displayName: "张三",
        maskedName: "张**",
        role: PrismaUserRole.BIDDER,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);
  readonly rooms = new Map<string, LiveRoom>([
    [
      "room_1",
      {
        id: "room_1",
        title: "Day10 直播间",
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
  readonly events: Array<{ auctionId: string; type: PrismaAuctionEventType; serverSeq: number }> = [];

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
        rule,
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
        .map((auction) => withAuctionRelations(auction, this)),
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
        rule: auction.rule,
        order: auction.order,
        version: auction.version + (data.version?.increment ?? 0)
      });
      return { count: 1 };
    },
    update: async ({
      where,
      data
    }: {
      where: { id: string };
      data: Partial<AuctionSession> & { version?: { increment: number } };
    }) => {
      const auction = this.auctions.get(where.id);
      assert.ok(auction);
      const updated = {
        ...auction,
        ...data,
        version: auction.version + (data.version?.increment ?? 0)
      };
      this.auctions.set(where.id, updated);
      return withAuctionRelations(updated, this);
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
    findMany: async ({ where }: { where: { auctionId: string; status: PrismaBidStatus } }) =>
      [...this.bids.values()]
        .filter((bid) => bid.auctionId === where.auctionId && bid.status === where.status)
        .map((bid) => ({
          ...bid,
          user: this.users.get(bid.userId)
        })),
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
      data: { auctionId: string; itemId: string; buyerId: string; amountFen: number; status: PrismaOrderStatus };
    }) => {
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
      const auction = this.auctions.get(data.auctionId);
      if (auction) {
        auction.order = order;
      }
      return order;
    },
    findMany: async () =>
      [...this.orders.values()].map((order) => ({
        ...order,
        item: this.items.get(order.itemId),
        buyer: this.users.get(order.buyerId),
        auction: this.auctions.get(order.auctionId)
      })),
    count: async () => this.orders.size
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
      this.events.push({
        auctionId: data.auctionId,
        type: data.type,
        serverSeq: data.serverSeq
      });
      return {
        id: `event_${this.events.length}`,
        ...data,
        publishedAt: null,
        createdAt: new Date()
      };
    }
  };

  async $transaction<T>(operation: ((tx: this) => Promise<T>) | Array<Promise<unknown>>): Promise<T> {
    if (Array.isArray(operation)) {
      return (await Promise.all(operation)) as T;
    }

    return operation(this);
  }
}

class Day10AtomicStore {
  async placeBid(input: AtomicBidInput): Promise<AtomicBidResult> {
    const serverSeq = input.auction.serverSeq + 1;
    return {
      accepted: true,
      auctionId: input.auction.id,
      amountFen: input.amountFen,
      previousPriceFen: input.auction.currentPriceFen,
      currentPriceFen: input.amountFen,
      previousHighestBidderId: input.auction.highestBidderId,
      previousEndTimeMs: input.auction.endTime?.getTime() ?? 0,
      previousExtendedCount: input.auction.extendedCount,
      previousBidCount: input.auction.bidCount,
      previousUserLeaderboardAmountFen: null,
      highestBidderId: input.userId,
      bidCount: input.auction.bidCount + 1,
      serverSeq,
      extended: false,
      newEndTimeMs: input.auction.endTime?.getTime() ?? 0,
      newExtendedCount: input.auction.extendedCount,
      reachedCapPrice: input.amountFen >= input.auction.capPriceFen
    };
  }

  async rollbackAcceptedBid(_input: AtomicBidRollbackInput): Promise<boolean> {
    return true;
  }
}

class Day10Scheduler {
  readonly scheduledAuctionIds: string[] = [];
  readonly clearedAuctionIds: string[] = [];

  scheduleEndTimer(auction: Pick<AuctionSession, "id">): void {
    this.scheduledAuctionIds.push(auction.id);
  }

  clearEndTimer(auctionId: string): void {
    this.clearedAuctionIds.push(auctionId);
  }
}

function withAuctionRelations(auction: AuctionWithRule, prisma: Day10Prisma) {
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
