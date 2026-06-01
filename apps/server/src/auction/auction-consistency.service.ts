import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  AuctionStatus as PrismaAuctionStatus,
  type AuctionSession
} from "@prisma/client";
import { auctionHotStateRedisKeys } from "../bid/bid-redis.store";
import { RedisService } from "../cache/redis.service";
import { PrismaService } from "../prisma/prisma.service";

type ConsistencyTimer = ReturnType<typeof setInterval> & {
  unref?: () => void;
};

interface RedisAuctionState {
  exists: boolean;
  status: string | null;
  currentPriceFen: number | null;
  highestBidderId: string | null;
  endTimeMs: number | null;
  bidCount: number | null;
  extendedCount: number | null;
  serverSeq: number | null;
  leaderboardSize: number;
}

interface ConsistencyMismatch {
  field: string;
  databaseValue: string | number | null;
  redisValue: string | number | null;
}

export interface AuctionConsistencyItem {
  auctionId: string;
  roomId: string;
  status: PrismaAuctionStatus;
  redisStateExists: boolean;
  mismatches: ConsistencyMismatch[];
}

export interface AuctionConsistencyReport {
  checkedAuctions: number;
  mismatchCount: number;
  items: AuctionConsistencyItem[];
}

@Injectable()
export class AuctionConsistencyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuctionConsistencyService.name);
  private readonly enabled = readBooleanEnv("AUCTION_CONSISTENCY_WORKER_ENABLED", true);
  private readonly intervalMs = readPositiveIntEnv(
    "AUCTION_CONSISTENCY_INTERVAL_MS",
    30_000
  );
  private readonly recentWindowMs = readPositiveIntEnv(
    "AUCTION_CONSISTENCY_RECENT_WINDOW_MS",
    24 * 60 * 60 * 1000
  );
  private readonly batchSize = readPositiveIntEnv("AUCTION_CONSISTENCY_BATCH_SIZE", 200);
  private timer: ConsistencyTimer | null = null;
  private isChecking = false;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisService)
    private readonly redis: RedisService
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }

    this.timer = setInterval(() => {
      void this.checkLoop();
    }, this.intervalMs) as ConsistencyTimer;
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkOnce(now = new Date()): Promise<AuctionConsistencyReport> {
    const auctions = await this.findAuctionsToCheck(now);
    const items: AuctionConsistencyItem[] = [];

    for (const auction of auctions) {
      const redisState = await this.readRedisState(auction.id);
      const mismatches = redisState.exists
        ? compareAuctionState(auction, redisState)
        : [];

      if (mismatches.length > 0) {
        await this.writeMismatchAudit(auction, redisState, mismatches);
      }

      items.push({
        auctionId: auction.id,
        roomId: auction.roomId,
        status: auction.status,
        redisStateExists: redisState.exists,
        mismatches
      });
    }

    return {
      checkedAuctions: items.length,
      mismatchCount: items.filter((item) => item.mismatches.length > 0).length,
      items
    };
  }

  private async checkLoop(): Promise<void> {
    if (this.isChecking) {
      return;
    }

    this.isChecking = true;

    try {
      const report = await this.checkOnce();
      if (report.mismatchCount > 0) {
        this.logger.warn(
          `Auction consistency check found ${report.mismatchCount} mismatched auction(s)`
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Auction consistency check failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      this.isChecking = false;
    }
  }

  private async findAuctionsToCheck(now: Date): Promise<AuctionSession[]> {
    const recentSince = new Date(now.getTime() - this.recentWindowMs);

    return this.prisma.auctionSession.findMany({
      where: {
        OR: [
          {
            status: PrismaAuctionStatus.RUNNING
          },
          {
            status: {
              in: [
                PrismaAuctionStatus.ENDED_SOLD,
                PrismaAuctionStatus.ENDED_UNSOLD,
                PrismaAuctionStatus.CANCELLED
              ]
            },
            updatedAt: {
              gte: recentSince
            }
          }
        ]
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: this.batchSize
    });
  }

  private async readRedisState(auctionId: string): Promise<RedisAuctionState> {
    const keys = auctionHotStateRedisKeys(auctionId);
    const [
      status,
      serverSeq,
      extendedCount,
      currentPriceFen,
      highestBidderId,
      endTimeMs,
      bidCount,
      leaderboardSize
    ] = await Promise.all([
      this.redis.hGet(keys.stateKey, "status"),
      this.redis.hGet(keys.stateKey, "server_seq"),
      this.redis.hGet(keys.stateKey, "extended_count"),
      this.redis.get(keys.currentPriceKey),
      this.redis.get(keys.highestBidderKey),
      this.redis.get(keys.endTimeKey),
      this.redis.get(keys.bidCountKey),
      this.redis.zCard(keys.leaderboardKey)
    ]);
    const exists =
      status !== null ||
      serverSeq !== null ||
      currentPriceFen !== null ||
      highestBidderId !== null ||
      endTimeMs !== null ||
      bidCount !== null ||
      leaderboardSize > 0;

    return {
      exists,
      status,
      currentPriceFen: toNullableNumber(currentPriceFen),
      highestBidderId: normalizeNullableString(highestBidderId),
      endTimeMs: toNullableNumber(endTimeMs),
      bidCount: toNullableNumber(bidCount),
      extendedCount: toNullableNumber(extendedCount),
      serverSeq: toNullableNumber(serverSeq),
      leaderboardSize
    };
  }

  private async writeMismatchAudit(
    auction: AuctionSession,
    redisState: RedisAuctionState,
    mismatches: ConsistencyMismatch[]
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: "AUCTION_RECONCILIATION_MISMATCH",
        auctionId: auction.id,
        roomId: auction.roomId,
        metadata: {
          mismatches,
          redisState
        } as never
      }
    });
  }
}

function compareAuctionState(
  auction: AuctionSession,
  redisState: RedisAuctionState
): ConsistencyMismatch[] {
  const mismatches: ConsistencyMismatch[] = [];

  compareField(mismatches, "status", auction.status, redisState.status);
  compareField(
    mismatches,
    "currentPriceFen",
    auction.currentPriceFen,
    redisState.currentPriceFen
  );
  compareField(
    mismatches,
    "highestBidderId",
    normalizeNullableString(auction.highestBidderId),
    redisState.highestBidderId
  );
  compareField(mismatches, "bidCount", auction.bidCount, redisState.bidCount);
  compareField(mismatches, "extendedCount", auction.extendedCount, redisState.extendedCount);
  compareField(mismatches, "serverSeq", auction.serverSeq, redisState.serverSeq);

  if (auction.endTime && redisState.endTimeMs !== null) {
    compareField(mismatches, "endTimeMs", auction.endTime.getTime(), redisState.endTimeMs);
  }

  if (redisState.leaderboardSize > auction.bidCount) {
    mismatches.push({
      field: "leaderboardSize",
      databaseValue: auction.bidCount,
      redisValue: redisState.leaderboardSize
    });
  }

  return mismatches;
}

function compareField(
  mismatches: ConsistencyMismatch[],
  field: string,
  databaseValue: string | number | null,
  redisValue: string | number | null
): void {
  if (redisValue === null) {
    return;
  }

  if (databaseValue !== redisValue) {
    mismatches.push({
      field,
      databaseValue,
      redisValue
    });
  }
}

function normalizeNullableString(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}

function toNullableNumber(value: string | null): number | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(raw);
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
