import { Inject, Injectable } from "@nestjs/common";
import {
  AuctionStatus as PrismaAuctionStatus,
  BidStatus as PrismaBidStatus,
  type AuctionItem,
  type AuctionRule,
  type AuctionSession,
  type Bid,
  type User
} from "@prisma/client";
import {
  AuctionErrorCode,
  AuctionSnapshot,
  AuctionStatus,
  type AuctionLeaderboardEntry
} from "@live-auction/shared";
import { notFound } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";

type AuctionForSnapshot = AuctionSession & {
  highestBidder: Pick<User, "id" | "maskedName"> | null;
};

type BidWithUser = Bid & {
  user: Pick<User, "id" | "maskedName">;
};

type PublicAuction = AuctionSession & {
  item: AuctionItem;
  rule: AuctionRule;
};

export interface RoomAuctionListDto {
  items: RoomAuctionListItemDto[];
}

export interface RoomAuctionListItemDto {
  auctionId: string;
  roomId: string;
  itemId: string;
  itemName: string;
  itemImageUrl: string;
  status: AuctionStatus;
  currentPriceFen: number;
  startPriceFen: number;
  nextBidAmountFen: number;
  bidCount: number;
  participantCount: number;
  endTime: string | null;
  serverTime: string;
  serverSeq: number;
}

export interface PublicAuctionDto {
  auctionId: string;
  roomId: string;
  item: {
    id: string;
    name: string;
    imageUrl: string;
    description: string;
    sellingPoints: string[];
  };
  status: AuctionStatus;
  startPriceFen: number;
  currentPriceFen: number;
  incrementFen: number;
  capPriceFen: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
  endTime: string | null;
  serverTime: string;
  serverSeq: number;
}

@Injectable()
export class AuctionSnapshotService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listRoomAuctions(roomId: string, now = new Date()): Promise<RoomAuctionListDto> {
    await this.ensureRoomExists(roomId);

    const auctions = await this.prisma.auctionSession.findMany({
      where: {
        roomId,
        status: {
          in: [
            PrismaAuctionStatus.SCHEDULED,
            PrismaAuctionStatus.RUNNING,
            PrismaAuctionStatus.ENDED_SOLD,
            PrismaAuctionStatus.ENDED_UNSOLD
          ]
        }
      },
      include: {
        item: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const items = await Promise.all(
      auctions.map(async (auction) => ({
        auctionId: auction.id,
        roomId: auction.roomId,
        itemId: auction.itemId,
        itemName: auction.item.name,
        itemImageUrl: auction.item.imageUrl,
        status: auction.status as AuctionStatus,
        currentPriceFen: auction.currentPriceFen,
        startPriceFen: auction.startPriceFen,
        nextBidAmountFen: getNextBidAmountFen(auction),
        bidCount: auction.bidCount,
        participantCount: await this.countParticipants(auction.id),
        endTime: auction.endTime?.toISOString() ?? null,
        serverTime: now.toISOString(),
        serverSeq: auction.serverSeq
      }))
    );

    return { items };
  }

  async getAuctionDetail(
    auctionId: string,
    now = new Date()
  ): Promise<PublicAuctionDto> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: auctionId },
      include: {
        item: true,
        rule: true
      }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
    }

    return toPublicAuctionDto(auction, now);
  }

  async getSnapshot(
    auctionId: string,
    userId: string,
    now = new Date()
  ): Promise<AuctionSnapshot> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: auctionId },
      include: {
        highestBidder: {
          select: {
            id: true,
            maskedName: true
          }
        }
      }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
    }

    const bids = await this.prisma.bid.findMany({
      where: {
        auctionId,
        status: PrismaBidStatus.ACCEPTED
      },
      include: {
        user: {
          select: {
            id: true,
            maskedName: true
          }
        }
      },
      orderBy: [
        { amountFen: "desc" },
        { createdAt: "asc" }
      ]
    });
    const rankedBidders = toRankedBidders(bids);
    const myRankIndex = rankedBidders.findIndex((entry) => entry.userId === userId);
    const myBidAmountFen =
      myRankIndex >= 0 ? rankedBidders[myRankIndex]?.amountFen ?? null : null;

    return {
      auctionId: auction.id,
      roomId: auction.roomId,
      status: auction.status as AuctionStatus,
      currentPriceFen: auction.currentPriceFen,
      nextBidAmountFen: getNextBidAmountFen(auction),
      highestBidderMaskedName: auction.highestBidder?.maskedName ?? null,
      myBidAmountFen,
      myRank: myRankIndex >= 0 ? myRankIndex + 1 : null,
      bidCount: auction.bidCount,
      participantCount: rankedBidders.length,
      endTime: auction.endTime?.toISOString() ?? null,
      serverTime: now.toISOString(),
      serverSeq: auction.serverSeq,
      leaderboard: rankedBidders.slice(0, 10)
    };
  }

  async getAuctionMeta(
    auctionId: string
  ): Promise<{ auctionId: string; roomId: string; serverSeq: number }> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        roomId: true,
        serverSeq: true
      }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
    }

    return {
      auctionId: auction.id,
      roomId: auction.roomId,
      serverSeq: auction.serverSeq
    };
  }

  async ensureRoomExists(roomId: string): Promise<void> {
    const room = await this.prisma.liveRoom.findUnique({
      where: { id: roomId },
      select: { id: true }
    });

    if (!room) {
      throw notFound(AuctionErrorCode.RoomNotFound, "直播间不存在", { roomId });
    }
  }

  async ensureAuctionExists(auctionId: string): Promise<void> {
    await this.getAuctionMeta(auctionId);
  }

  private async countParticipants(auctionId: string): Promise<number> {
    const participants = await this.prisma.bid.findMany({
      where: {
        auctionId,
        status: PrismaBidStatus.ACCEPTED
      },
      select: {
        userId: true
      },
      distinct: ["userId"]
    });

    return participants.length;
  }
}

function toPublicAuctionDto(auction: PublicAuction, now: Date): PublicAuctionDto {
  return {
    auctionId: auction.id,
    roomId: auction.roomId,
    item: {
      id: auction.item.id,
      name: auction.item.name,
      imageUrl: auction.item.imageUrl,
      description: auction.item.description,
      sellingPoints: Array.isArray(auction.item.sellingPoints)
        ? auction.item.sellingPoints.filter((value): value is string => typeof value === "string")
        : []
    },
    status: auction.status as AuctionStatus,
    startPriceFen: auction.startPriceFen,
    currentPriceFen: auction.currentPriceFen,
    incrementFen: auction.incrementFen,
    capPriceFen: auction.capPriceFen,
    antiSnipingWindowSeconds: auction.rule.antiSnipingWindowSeconds,
    extensionSeconds: auction.rule.extensionSeconds,
    maxExtensionCount: auction.rule.maxExtensionCount,
    endTime: auction.endTime?.toISOString() ?? null,
    serverTime: now.toISOString(),
    serverSeq: auction.serverSeq
  };
}

function toRankedBidders(bids: BidWithUser[]): AuctionLeaderboardEntry[] {
  const seenUserIds = new Set<string>();
  const leaderboard: AuctionLeaderboardEntry[] = [];

  for (const bid of bids) {
    if (seenUserIds.has(bid.userId)) {
      continue;
    }

    seenUserIds.add(bid.userId);
    leaderboard.push({
      rank: leaderboard.length + 1,
      userId: bid.userId,
      maskedName: bid.user.maskedName,
      amountFen: bid.amountFen,
      bidTime: bid.createdAt.toISOString()
    });
  }

  return leaderboard;
}

function getNextBidAmountFen(
  auction: Pick<AuctionSession, "status" | "currentPriceFen" | "incrementFen" | "capPriceFen">
): number {
  if (auction.status !== PrismaAuctionStatus.RUNNING) {
    return auction.currentPriceFen;
  }

  return Math.min(auction.currentPriceFen + auction.incrementFen, auction.capPriceFen);
}
