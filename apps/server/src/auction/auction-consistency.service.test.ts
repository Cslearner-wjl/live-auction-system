import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionStatus as PrismaAuctionStatus,
  type AuctionSession
} from "@prisma/client";
import { auctionHotStateRedisKeys } from "../bid/bid-redis.store";
import { RedisService } from "../cache/redis.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuctionConsistencyService } from "./auction-consistency.service";

class FakePrisma {
  readonly auctions: AuctionSession[] = [];
  readonly auditLogs: Array<Record<string, unknown>> = [];

  readonly auctionSession = {
    findMany: async () => this.auctions
  };

  readonly auditLog = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.auditLogs.push(data);
      return { id: `audit_${this.auditLogs.length}`, ...data };
    }
  };
}

class FakeRedis {
  readonly strings = new Map<string, string>();
  readonly hashes = new Map<string, Map<string, string>>();
  readonly zsetSizes = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async zCard(key: string): Promise<number> {
    return this.zsetSizes.get(key) ?? 0;
  }

  setHash(key: string, values: Record<string, string>): void {
    this.hashes.set(key, new Map(Object.entries(values)));
  }
}

describe("AuctionConsistencyService", () => {
  it("skips auctions without Redis hot state", async () => {
    const prisma = new FakePrisma();
    const redis = new FakeRedis();
    prisma.auctions.push(makeAuction());
    const service = new AuctionConsistencyService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService
    );

    const report = await service.checkOnce();

    assert.equal(report.checkedAuctions, 1);
    assert.equal(report.mismatchCount, 0);
    assert.equal(report.items[0]?.redisStateExists, false);
    assert.equal(prisma.auditLogs.length, 0);
  });

  it("records audit logs when Redis hot state diverges from the database", async () => {
    const prisma = new FakePrisma();
    const redis = new FakeRedis();
    const auction = makeAuction();
    const keys = auctionHotStateRedisKeys(auction.id);
    prisma.auctions.push(auction);
    redis.setHash(keys.stateKey, {
      status: PrismaAuctionStatus.RUNNING,
      server_seq: "7",
      extended_count: "1"
    });
    redis.strings.set(keys.currentPriceKey, "3000");
    redis.strings.set(keys.highestBidderKey, "user_2");
    redis.strings.set(keys.endTimeKey, String(auction.endTime?.getTime() ?? 0));
    redis.strings.set(keys.bidCountKey, "3");
    redis.zsetSizes.set(keys.leaderboardKey, 3);
    const service = new AuctionConsistencyService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService
    );

    const report = await service.checkOnce();

    assert.equal(report.mismatchCount, 1);
    assert.deepEqual(
      report.items[0]?.mismatches.map((item) => item.field),
      [
        "currentPriceFen",
        "highestBidderId",
        "bidCount",
        "extendedCount",
        "serverSeq",
        "leaderboardSize"
      ]
    );
    assert.equal(prisma.auditLogs.length, 1);
    assert.equal(prisma.auditLogs[0]?.action, "AUCTION_RECONCILIATION_MISMATCH");
  });
});

function makeAuction(overrides: Partial<AuctionSession> = {}): AuctionSession {
  const now = new Date("2026-06-01T10:00:00.000Z");

  return {
    id: "auction_1",
    roomId: "room_1",
    itemId: "item_1",
    ruleId: "rule_1",
    status: PrismaAuctionStatus.RUNNING,
    startTime: new Date(now.getTime() - 60_000),
    endTime: new Date(now.getTime() + 60_000),
    startPriceFen: 0,
    currentPriceFen: 2000,
    incrementFen: 1000,
    capPriceFen: 100000,
    highestBidderId: "user_1",
    bidCount: 2,
    extendedCount: 0,
    serverSeq: 6,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}
