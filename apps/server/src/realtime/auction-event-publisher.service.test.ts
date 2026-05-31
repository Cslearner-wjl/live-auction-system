import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionEventType as PrismaAuctionEventType,
  OutboxStatus as PrismaOutboxStatus,
  type AuctionEvent,
  type User
} from "@prisma/client";
import { AuctionWebSocketEvent, auctionRoomName, userRoomName } from "@live-auction/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuctionEventPublisherService } from "./auction-event-publisher.service";
import { AuctionRealtimeGateway } from "./auction-realtime.gateway";

interface Emission {
  room: string;
  event: AuctionWebSocketEvent;
  payload: Record<string, unknown>;
}

class FakeGateway {
  readonly emissions: Emission[] = [];

  emitAuctionEvent(
    auctionId: string,
    event: AuctionWebSocketEvent,
    payload: unknown
  ): void {
    this.emissions.push({
      room: auctionRoomName(auctionId),
      event,
      payload: payload as Record<string, unknown>
    });
  }

  emitRoomEvent(roomId: string, event: AuctionWebSocketEvent, payload: unknown): void {
    this.emissions.push({
      room: `room:${roomId}`,
      event,
      payload: payload as Record<string, unknown>
    });
  }

  emitUserEvent(userId: string, event: AuctionWebSocketEvent, payload: unknown): void {
    this.emissions.push({
      room: userRoomName(userId),
      event,
      payload: payload as Record<string, unknown>
    });
  }

  emitAuctionAndRoomEvent(
    roomId: string,
    auctionId: string,
    event: AuctionWebSocketEvent,
    payload: unknown
  ): void {
    this.emitRoomEvent(roomId, event, payload);
    this.emitAuctionEvent(auctionId, event, payload);
  }
}

class FakePrisma {
  readonly users = new Map<string, Pick<User, "id" | "maskedName">>([
    ["user_new", { id: "user_new", maskedName: "新**" }],
    ["user_old", { id: "user_old", maskedName: "旧**" }]
  ]);
  readonly events = new Map<string, AuctionEvent>();
  readonly auditLogs: Array<Record<string, unknown>> = [];

  readonly user = {
    findUnique: async ({
      where
    }: {
      where: { id: string };
      select: { maskedName: boolean };
    }) => this.users.get(where.id) ?? null
  };

  readonly auctionEvent = {
    findMany: async ({
      where,
      take
    }: {
      where: { outboxStatus: PrismaOutboxStatus | { in: PrismaOutboxStatus[] } };
      orderBy: { createdAt: "asc" };
      take: number;
    }) =>
      [...this.events.values()]
        .filter((event) => matchesOutboxStatus(event.outboxStatus, where.outboxStatus))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .slice(0, take),
    updateMany: async ({
      where,
      data
    }: {
      where: { id: string; outboxStatus: PrismaOutboxStatus | { in: PrismaOutboxStatus[] } };
      data: { outboxStatus: PrismaOutboxStatus; publishedAt?: Date };
    }) => {
      const event = this.events.get(where.id);

      if (!event || !matchesOutboxStatus(event.outboxStatus, where.outboxStatus)) {
        return { count: 0 };
      }

      this.events.set(where.id, {
        ...event,
        outboxStatus: data.outboxStatus,
        publishedAt: data.publishedAt ?? event.publishedAt
      });

      return { count: 1 };
    },
    update: async ({
      where,
      data
    }: {
      where: { id: string };
      data: { outboxStatus: PrismaOutboxStatus };
    }) => {
      const event = this.events.get(where.id);
      assert.ok(event);
      const updated = {
        ...event,
        outboxStatus: data.outboxStatus
      };
      this.events.set(where.id, updated);
      return updated;
    }
  };

  readonly auditLog = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.auditLogs.push(data);
      return { id: `audit_${this.auditLogs.length}`, ...data };
    }
  };
}

describe("AuctionEventPublisherService", () => {
  it("publishes accepted bids only to auction room and user-specific rooms", async () => {
    const prisma = new FakePrisma();
    const gateway = new FakeGateway();
    const publisher = new AuctionEventPublisherService(
      prisma as unknown as PrismaService,
      gateway as unknown as AuctionRealtimeGateway
    );

    await publisher.publishEvent(
      makeEvent(PrismaAuctionEventType.BID_ACCEPTED, {
        bidId: "bid_1",
        amountFen: 2000,
        previousPriceFen: 1000,
        currentPriceFen: 2000,
        previousHighestBidderId: "user_old",
        highestBidderId: "user_new",
        bidCount: 2,
        extended: true,
        oldEndTime: "2026-06-01T10:00:00.000Z",
        endTime: "2026-06-01T10:00:15.000Z",
        extendedCount: 1,
        reachedCapPrice: false,
        serverTime: "2026-06-01T09:59:50.000Z"
      })
    );

    assert.deepEqual(
      gateway.emissions.map((item) => [item.room, item.event]),
      [
        [auctionRoomName("auction_1"), AuctionWebSocketEvent.BidAccepted],
        [userRoomName("user_new"), AuctionWebSocketEvent.Leading],
        [userRoomName("user_old"), AuctionWebSocketEvent.Outbid],
        [auctionRoomName("auction_1"), AuctionWebSocketEvent.AuctionExtended]
      ]
    );
    assert.equal(gateway.emissions[0]?.payload.maskedName, "新**");
    assert.equal(gateway.emissions[2]?.payload.message, "你已被超越");
    assert.equal(gateway.emissions[3]?.payload.newEndTime, "2026-06-01T10:00:15.000Z");
  });

  it("marks pending events as published after successful broadcast", async () => {
    const prisma = new FakePrisma();
    const gateway = new FakeGateway();
    const event = makeEvent(PrismaAuctionEventType.AUCTION_CANCELLED, {
      reason: "商品状态异常"
    });
    prisma.events.set(event.id, event);
    const publisher = new AuctionEventPublisherService(
      prisma as unknown as PrismaService,
      gateway as unknown as AuctionRealtimeGateway
    );

    const result = await publisher.publishPendingOnce();

    assert.deepEqual(result, { published: 1, failed: 0 });
    assert.equal(prisma.events.get(event.id)?.outboxStatus, PrismaOutboxStatus.PUBLISHED);
    assert.deepEqual(
      gateway.emissions.map((item) => [item.room, item.event]),
      [
        ["room:room_1", AuctionWebSocketEvent.AuctionCancelled],
        [auctionRoomName("auction_1"), AuctionWebSocketEvent.AuctionCancelled]
      ]
    );
  });

  it("keeps failed outbox events for later inspection and records audit logs", async () => {
    const prisma = new FakePrisma();
    const gateway = new FakeGateway();
    const event = makeEvent(PrismaAuctionEventType.ORDER_CREATED, {
      orderId: "order_1",
      amountFen: 10000
    });
    prisma.events.set(event.id, event);
    const publisher = new AuctionEventPublisherService(
      prisma as unknown as PrismaService,
      gateway as unknown as AuctionRealtimeGateway
    );

    const result = await publisher.publishPendingOnce();

    assert.deepEqual(result, { published: 0, failed: 1 });
    assert.equal(prisma.events.get(event.id)?.outboxStatus, PrismaOutboxStatus.FAILED);
    assert.equal(prisma.auditLogs.length, 1);
    assert.equal(prisma.auditLogs[0]?.action, "AUCTION_EVENT_PUBLISH_FAILED");
  });

  it("retries failed outbox events and marks them published after a later successful broadcast", async () => {
    const prisma = new FakePrisma();
    const gateway = new FakeGateway();
    const event = makeEvent(PrismaAuctionEventType.ORDER_CREATED, {
      orderId: "order_1",
      buyerId: "user_new",
      amountFen: 10000
    });
    prisma.events.set(event.id, {
      ...event,
      outboxStatus: PrismaOutboxStatus.FAILED
    });
    const publisher = new AuctionEventPublisherService(
      prisma as unknown as PrismaService,
      gateway as unknown as AuctionRealtimeGateway
    );

    const result = await publisher.publishPendingOnce();

    assert.deepEqual(result, { published: 1, failed: 0 });
    assert.equal(prisma.events.get(event.id)?.outboxStatus, PrismaOutboxStatus.PUBLISHED);
    assert.deepEqual(
      gateway.emissions.map((item) => [item.room, item.event]),
      [[userRoomName("user_new"), AuctionWebSocketEvent.OrderCreated]]
    );
  });
});

function matchesOutboxStatus(
  actual: PrismaOutboxStatus,
  expected: PrismaOutboxStatus | { in: PrismaOutboxStatus[] }
): boolean {
  return typeof expected === "string" ? actual === expected : expected.in.includes(actual);
}

function makeEvent(
  type: PrismaAuctionEventType,
  payload: Record<string, unknown>
): AuctionEvent {
  return {
    id: `event_${type.toLowerCase()}`,
    auctionId: "auction_1",
    roomId: "room_1",
    type,
    serverSeq: 18,
    payload: {
      type,
      auctionId: "auction_1",
      roomId: "room_1",
      serverSeq: 18,
      ...payload
    } as never,
    outboxStatus: PrismaOutboxStatus.PENDING,
    publishedAt: null,
    createdAt: new Date("2026-06-01T09:59:50.000Z")
  };
}
