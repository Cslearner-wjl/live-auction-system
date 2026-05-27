import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionStatus as PrismaAuctionStatus,
  BidStatus as PrismaBidStatus,
  type AuctionItem,
  type AuctionRule,
  type AuctionSession,
  type Bid,
  type User
} from "@prisma/client";
import { AuctionStatus } from "@live-auction/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuctionSnapshotService } from "./auction-snapshot.service";

type TestBid = Bid & {
  user: Pick<User, "id" | "maskedName">;
};

class FakePrisma {
  readonly rooms = new Set<string>(["room_1"]);
  readonly users = new Map<string, Pick<User, "id" | "maskedName">>();
  readonly items = new Map<string, AuctionItem>();
  readonly rules = new Map<string, AuctionRule>();
  readonly auctions = new Map<string, AuctionSession>();
  readonly bids: TestBid[] = [];

  readonly liveRoom = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.rooms.has(where.id) ? { id: where.id } : null
  };

  readonly auctionSession = {
    findUnique: async ({
      where,
      include,
      select
    }: {
      where: { id: string };
      include?: {
        highestBidder?: unknown;
        item?: boolean;
        rule?: boolean;
      };
      select?: {
        id?: boolean;
        roomId?: boolean;
        serverSeq?: boolean;
      };
    }) => {
      const auction = this.auctions.get(where.id);

      if (!auction) {
        return null;
      }

      if (select) {
        return {
          id: auction.id,
          roomId: auction.roomId,
          serverSeq: auction.serverSeq
        };
      }

      return {
        ...auction,
        highestBidder: include?.highestBidder && auction.highestBidderId
          ? this.users.get(auction.highestBidderId) ?? null
          : null,
        item: include?.item ? this.items.get(auction.itemId) : undefined,
        rule: include?.rule ? this.rules.get(auction.ruleId) : undefined
      };
    },
    findMany: async ({
      where
    }: {
      where: {
        roomId: string;
        status: { in: PrismaAuctionStatus[] };
      };
    }) =>
      [...this.auctions.values()]
        .filter(
          (auction) =>
            auction.roomId === where.roomId && where.status.in.includes(auction.status)
        )
        .map((auction) => ({
          ...auction,
          item: this.items.get(auction.itemId) as AuctionItem
        }))
  };

  readonly bid = {
    findMany: async ({
      where,
      distinct
    }: {
      where: {
        auctionId: string;
        status: PrismaBidStatus;
      };
      distinct?: "userId"[];
    }) => {
      const bids = this.bids
        .filter((bid) => bid.auctionId === where.auctionId && bid.status === where.status)
        .sort((left, right) => {
          const amountDiff = right.amountFen - left.amountFen;
          return amountDiff === 0
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : amountDiff;
        });

      if (distinct?.includes("userId")) {
        const seen = new Set<string>();
        return bids.filter((bid) => {
          if (seen.has(bid.userId)) {
            return false;
          }
          seen.add(bid.userId);
          return true;
        });
      }

      return bids;
    }
  };
}

describe("AuctionSnapshotService", () => {
  it("returns a reconnect snapshot with server time, serverSeq, rank, and leaderboard", async () => {
    const prisma = new FakePrisma();
    seedSnapshotData(prisma);
    const service = new AuctionSnapshotService(prisma as unknown as PrismaService);

    const snapshot = await service.getSnapshot(
      "auction_1",
      "user_2",
      new Date("2026-06-01T09:59:51.000Z")
    );

    assert.equal(snapshot.auctionId, "auction_1");
    assert.equal(snapshot.roomId, "room_1");
    assert.equal(snapshot.status, AuctionStatus.Running);
    assert.equal(snapshot.currentPriceFen, 3000);
    assert.equal(snapshot.nextBidAmountFen, 4000);
    assert.equal(snapshot.highestBidderMaskedName, "王**");
    assert.equal(snapshot.myBidAmountFen, 2000);
    assert.equal(snapshot.myRank, 2);
    assert.equal(snapshot.participantCount, 3);
    assert.equal(snapshot.serverSeq, 7);
    assert.equal(snapshot.serverTime, "2026-06-01T09:59:51.000Z");
    assert.deepEqual(
      snapshot.leaderboard.map((entry) => [entry.rank, entry.userId, entry.amountFen]),
      [
        [1, "user_3", 3000],
        [2, "user_2", 2000],
        [3, "user_1", 1000]
      ]
    );
  });

  it("lists room auctions with participant counts for reconnect bootstrap", async () => {
    const prisma = new FakePrisma();
    seedSnapshotData(prisma);
    const service = new AuctionSnapshotService(prisma as unknown as PrismaService);

    const result = await service.listRoomAuctions(
      "room_1",
      new Date("2026-06-01T09:59:52.000Z")
    );

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.auctionId, "auction_1");
    assert.equal(result.items[0]?.participantCount, 3);
    assert.equal(result.items[0]?.serverSeq, 7);
  });
});

function seedSnapshotData(prisma: FakePrisma): void {
  const now = new Date("2026-06-01T09:58:00.000Z");
  prisma.users.set("user_1", { id: "user_1", maskedName: "张**" });
  prisma.users.set("user_2", { id: "user_2", maskedName: "李**" });
  prisma.users.set("user_3", { id: "user_3", maskedName: "王**" });
  prisma.items.set("item_1", makeItem(now));
  prisma.rules.set("rule_1", makeRule(now));
  prisma.auctions.set("auction_1", makeAuction(now));
  prisma.bids.push(
    makeBid("bid_1", "user_1", 1000, new Date("2026-06-01T09:59:01.000Z")),
    makeBid("bid_2", "user_2", 2000, new Date("2026-06-01T09:59:02.000Z")),
    makeBid("bid_3", "user_3", 3000, new Date("2026-06-01T09:59:03.000Z"))
  );
}

function makeAuction(now: Date): AuctionSession {
  return {
    id: "auction_1",
    roomId: "room_1",
    itemId: "item_1",
    ruleId: "rule_1",
    status: PrismaAuctionStatus.RUNNING,
    startTime: new Date("2026-06-01T09:55:00.000Z"),
    endTime: new Date("2026-06-01T10:00:00.000Z"),
    startPriceFen: 0,
    currentPriceFen: 3000,
    incrementFen: 1000,
    capPriceFen: 100000,
    highestBidderId: "user_3",
    bidCount: 3,
    extendedCount: 0,
    serverSeq: 7,
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}

function makeRule(now: Date): AuctionRule {
  return {
    id: "rule_1",
    startPriceFen: 0,
    incrementFen: 1000,
    durationSeconds: 300,
    capPriceFen: 100000,
    antiSnipingWindowSeconds: 10,
    extensionSeconds: 15,
    maxExtensionCount: 3,
    createdAt: now,
    updatedAt: now
  };
}

function makeItem(now: Date): AuctionItem {
  return {
    id: "item_1",
    name: "翡翠手镯",
    imageUrl: "https://example.com/item.png",
    description: "天然翡翠手镯",
    sellingPoints: ["支持鉴定"],
    createdById: "admin_1",
    createdAt: now,
    updatedAt: now
  };
}

function makeBid(id: string, userId: string, amountFen: number, createdAt: Date): TestBid {
  return {
    id,
    auctionId: "auction_1",
    userId,
    amountFen,
    clientBidId: `client_${id}`,
    serverSeq: Number(id.split("_")[1]),
    status: PrismaBidStatus.ACCEPTED,
    rejectReason: null,
    createdAt,
    user: {
      id: userId,
      maskedName: `${userId}**`
    }
  };
}
