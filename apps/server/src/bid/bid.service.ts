import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  AuctionEventType as PrismaAuctionEventType,
  AuctionStatus as PrismaAuctionStatus,
  BidStatus as PrismaBidStatus,
  OutboxStatus as PrismaOutboxStatus,
  UserRole as PrismaUserRole,
  type AuctionRule,
  type AuctionSession,
  type Bid,
  type Order
} from "@prisma/client";
import {
  AuctionErrorCode,
  AuctionStatus,
  AuctionWebSocketEvent
} from "@live-auction/shared";
import { AuctionSchedulerService } from "../auction/auction-scheduler.service";
import { AuctionStateMachineService } from "../auction/auction-state-machine.service";
import {
  RedisLockTimeoutError,
  RedisService
} from "../cache/redis.service";
import { ApiException, conflict, notFound } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";
import {
  type AtomicBidAccepted,
  type AtomicBidRejected,
  RedisBidAtomicStore
} from "./bid-redis.store";
import {
  type PlaceBidPayload,
  parsePlaceBid
} from "./bid.validation";

type AuctionForBid = AuctionSession & {
  rule: AuctionRule;
  order?: Order | null;
};

export interface PlaceBidResultDto {
  accepted: true;
  auctionId: string;
  bidId: string;
  amountFen: number;
  currentPriceFen: number;
  previousPriceFen: number | null;
  previousHighestBidderId: string | null;
  highestBidderId: string | null;
  bidCount: number;
  serverSeq: number;
  extended: boolean;
  endTime: string | null;
  reachedCapPrice: boolean;
  status: AuctionStatus;
  orderId?: string;
  idempotent: boolean;
}

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);
  private readonly auctionBidQueues = new Map<string, Promise<void>>();
  private readonly lockTtlMs = readPositiveIntEnv("BID_LOCK_TTL_MS", 15_000);
  private readonly lockWaitTimeoutMs = readPositiveIntEnv(
    "BID_LOCK_WAIT_TIMEOUT_MS",
    10_000
  );
  private readonly lockRetryDelayMs = readPositiveIntEnv(
    "BID_LOCK_RETRY_DELAY_MS",
    25
  );

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisBidAtomicStore)
    private readonly atomicStore: RedisBidAtomicStore,
    @Inject(RedisService)
    private readonly redis: RedisService,
    @Inject(AuctionStateMachineService)
    private readonly stateMachine: AuctionStateMachineService,
    @Inject(AuctionSchedulerService)
    private readonly scheduler: AuctionSchedulerService
  ) {}

  async placeBid(
    auctionId: string,
    userId: string,
    payload: PlaceBidPayload
  ): Promise<PlaceBidResultDto> {
    const input = parsePlaceBid(payload);

    return this.runWithAuctionBidQueue(auctionId, async () => {
      try {
        return await this.redis.withLock(
          {
            key: auctionBidLockKey(auctionId),
            ttlMs: this.lockTtlMs,
            waitTimeoutMs: this.lockWaitTimeoutMs,
            retryDelayMs: this.lockRetryDelayMs
          },
          () => this.placeBidWithLock(auctionId, userId, input)
        );
      } catch (error: unknown) {
        if (error instanceof RedisLockTimeoutError) {
          throw new ApiException(
            HttpStatus.SERVICE_UNAVAILABLE,
            AuctionErrorCode.BidConcurrencyBusy,
            "当前竞拍出价繁忙，请稍后重试",
            {
              auctionId,
              lockKey: error.key,
              waitTimeoutMs: error.waitTimeoutMs
            }
          );
        }

        throw error;
      }
    });
  }

  private async placeBidWithLock(
    auctionId: string,
    userId: string,
    input: ReturnType<typeof parsePlaceBid>
  ): Promise<PlaceBidResultDto> {
    await this.ensureDemoBidderExists(userId);

    const existingBid = await this.findExistingBid(auctionId, input.clientBidId);

    if (existingBid) {
      return this.toIdempotentResult(existingBid);
    }

    const auction = await this.getAuctionForBid(auctionId);
    const now = new Date();
    assertAuctionCanReceiveBid(auction, now);

    const atomicResult = await this.atomicStore.placeBid({
      auction,
      userId,
      amountFen: input.amountFen,
      clientBidId: input.clientBidId,
      now
    });

    if (!atomicResult.accepted) {
      throwAtomicRejection(atomicResult, input.clientBidId);
    }

    const acceptedBid = await this.persistAcceptedBid({
      auction,
      userId,
      clientBidId: input.clientBidId,
      now,
      atomic: atomicResult
    });

    let finalAuction = acceptedBid.auction;
    let orderId = finalAuction.order?.id;

    if (atomicResult.reachedCapPrice) {
      const settled = await this.stateMachine.settleSoldAuction(auctionId, {
        enforceEndTime: false
      });
      this.scheduler.clearEndTimer(auctionId);
      finalAuction = {
        ...settled.auction,
        rule: auction.rule,
        order: settled.order
      };
      orderId = settled.order?.id;
    } else if (atomicResult.extended) {
      this.scheduler.scheduleEndTimer(acceptedBid.auction);
    }

    return {
      accepted: true,
      auctionId,
      bidId: acceptedBid.bid.id,
      amountFen: acceptedBid.bid.amountFen,
      currentPriceFen: finalAuction.currentPriceFen,
      previousPriceFen: atomicResult.previousPriceFen,
      previousHighestBidderId: atomicResult.previousHighestBidderId,
      highestBidderId: finalAuction.highestBidderId,
      bidCount: finalAuction.bidCount,
      serverSeq: acceptedBid.bid.serverSeq,
      extended: atomicResult.extended,
      endTime: finalAuction.endTime?.toISOString() ?? null,
      reachedCapPrice: atomicResult.reachedCapPrice,
      status: finalAuction.status as AuctionStatus,
      orderId,
      idempotent: false
    };
  }

  private async runWithAuctionBidQueue<T>(
    auctionId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.auctionBidQueues.get(auctionId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(operation);
    const settled = queued.then(
      () => undefined,
      () => undefined
    );

    this.auctionBidQueues.set(auctionId, settled);

    try {
      return await queued;
    } finally {
      if (this.auctionBidQueues.get(auctionId) === settled) {
        this.auctionBidQueues.delete(auctionId);
      }
    }
  }

  private async getAuctionForBid(auctionId: string): Promise<AuctionForBid> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: auctionId },
      include: {
        rule: true,
        order: true
      }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
    }

    return auction;
  }

  private async findExistingBid(
    auctionId: string,
    clientBidId: string
  ): Promise<Bid | null> {
    return this.prisma.bid.findUnique({
      where: {
        auctionId_clientBidId: {
          auctionId,
          clientBidId
        }
      }
    });
  }

  private async ensureDemoBidderExists(userId: string): Promise<void> {
    const existing = await this.findUserRole(userId);

    if (existing?.role === PrismaUserRole.BIDDER) {
      return;
    }

    if (existing) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuctionErrorCode.Forbidden,
        "当前用户不是竞拍用户",
        { userId, role: existing.role }
      );
    }

    const demoUserMatch = /^user_(\d{1,4})$/.exec(userId);

    if (!demoUserMatch) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AuctionErrorCode.Forbidden,
        "竞拍用户不存在，请使用 user_1、user_2、user_3 等 demo 用户",
        { userId }
      );
    }

    const suffix = demoUserMatch[1];
    try {
      await this.prisma.user.create({
        data: {
          id: userId,
          displayName: `Demo Bidder ${suffix}`,
          maskedName: `User ${suffix}`,
          role: PrismaUserRole.BIDDER
        }
      });
    } catch (error: unknown) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const racedUser = await this.findUserRole(userId);
      if (racedUser?.role === PrismaUserRole.BIDDER) {
        return;
      }

      if (racedUser) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          AuctionErrorCode.Forbidden,
          "当前用户不是竞拍用户",
          { userId, role: racedUser.role }
        );
      }

      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        AuctionErrorCode.BidConcurrencyBusy,
        "竞拍用户初始化繁忙，请稍后重试",
        { userId }
      );
    }
  }

  private async findUserRole(
    userId: string
  ): Promise<{ id: string; role: PrismaUserRole } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true
      }
    });
  }

  private async toIdempotentResult(bid: Bid): Promise<PlaceBidResultDto> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: bid.auctionId },
      include: {
        order: true,
        rule: true
      }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", {
        auctionId: bid.auctionId
      });
    }

    return {
      accepted: true,
      auctionId: bid.auctionId,
      bidId: bid.id,
      amountFen: bid.amountFen,
      currentPriceFen: auction.currentPriceFen,
      previousPriceFen: null,
      previousHighestBidderId: null,
      highestBidderId: auction.highestBidderId,
      bidCount: auction.bidCount,
      serverSeq: bid.serverSeq,
      extended: false,
      endTime: auction.endTime?.toISOString() ?? null,
      reachedCapPrice:
        auction.status === PrismaAuctionStatus.ENDED_SOLD &&
        auction.currentPriceFen >= auction.capPriceFen,
      status: auction.status as AuctionStatus,
      orderId: auction.order?.id,
      idempotent: true
    };
  }

  private async persistAcceptedBid(input: {
    auction: AuctionForBid;
    userId: string;
    clientBidId: string;
    now: Date;
    atomic: AtomicBidAccepted;
  }): Promise<{ bid: Bid; auction: AuctionForBid }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const bid = await tx.bid.create({
          data: {
            auctionId: input.auction.id,
            userId: input.userId,
            amountFen: input.atomic.amountFen,
            clientBidId: input.clientBidId,
            serverSeq: input.atomic.serverSeq,
            status: PrismaBidStatus.ACCEPTED
          }
        });

        const updatedAuction = await tx.auctionSession.updateMany({
          where: {
            id: input.auction.id,
            status: PrismaAuctionStatus.RUNNING,
            serverSeq: {
              lt: input.atomic.serverSeq
            }
          },
          data: {
            currentPriceFen: input.atomic.currentPriceFen,
            highestBidderId: input.userId,
            bidCount: input.atomic.bidCount,
            endTime: new Date(input.atomic.newEndTimeMs),
            extendedCount: input.atomic.newExtendedCount,
            serverSeq: input.atomic.serverSeq,
            version: {
              increment: 1
            }
          }
        });

        if (updatedAuction.count !== 1) {
          throw new Error(
            `Auction ${input.auction.id} was not updated for accepted bid seq ${input.atomic.serverSeq}`
          );
        }

        await tx.auctionEvent.create({
          data: {
            auctionId: input.auction.id,
            roomId: input.auction.roomId,
            type: PrismaAuctionEventType.BID_ACCEPTED,
            serverSeq: input.atomic.serverSeq,
            payload: {
              type: AuctionWebSocketEvent.BidAccepted,
              auctionId: input.auction.id,
              roomId: input.auction.roomId,
              bidId: bid.id,
              amountFen: input.atomic.amountFen,
              previousPriceFen: input.atomic.previousPriceFen,
              currentPriceFen: input.atomic.currentPriceFen,
              previousHighestBidderId: input.atomic.previousHighestBidderId,
              highestBidderId: input.userId,
              bidCount: input.atomic.bidCount,
              extended: input.atomic.extended,
              oldEndTime: input.auction.endTime?.toISOString() ?? null,
              endTime: new Date(input.atomic.newEndTimeMs).toISOString(),
              extendedCount: input.atomic.newExtendedCount,
              reachedCapPrice: input.atomic.reachedCapPrice,
              serverSeq: input.atomic.serverSeq,
              serverTime: input.now.toISOString()
            },
            outboxStatus: PrismaOutboxStatus.PENDING
          }
        });

        const auction = await tx.auctionSession.findUniqueOrThrow({
          where: { id: input.auction.id },
          include: {
            rule: true,
            order: true
          }
        });

        return { bid, auction };
      });
    } catch (error: unknown) {
      if (isPrismaUniqueConstraintError(error)) {
        const existing = await this.findExistingBid(input.auction.id, input.clientBidId);
        if (existing) {
          return {
            bid: existing,
            auction: await this.getAuctionForBid(input.auction.id)
          };
        }
      }

      const rollbackSucceeded = await this.rollbackAcceptedRedisBid(input);
      await this.writePersistenceFailureAudit(input, error, rollbackSucceeded);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        AuctionErrorCode.BidPersistenceFailed,
        "出价已进入一致性补偿，请拉取最新快照后重试",
        {
          auctionId: input.auction.id,
          userId: input.userId,
          clientBidId: input.clientBidId,
          serverSeq: input.atomic.serverSeq,
          redisRollbackSucceeded: rollbackSucceeded
        }
      );
    }
  }

  private async rollbackAcceptedRedisBid(input: {
    clientBidId: string;
    atomic: AtomicBidAccepted;
  }): Promise<boolean> {
    try {
      return await this.atomicStore.rollbackAcceptedBid({
        acceptedBid: input.atomic,
        clientBidId: input.clientBidId
      });
    } catch (rollbackError: unknown) {
      this.logger.warn(
        `Failed to rollback Redis accepted bid ${input.atomic.auctionId}:${input.clientBidId}: ${
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        }`
      );
      return false;
    }
  }

  private async writePersistenceFailureAudit(
    input: {
      auction: AuctionForBid;
      userId: string;
      clientBidId: string;
      atomic: AtomicBidAccepted;
    },
    error: unknown,
    rollbackSucceeded: boolean
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          action: "DB_WRITE_FAILED_AFTER_REDIS_ACCEPTED",
          auctionId: input.auction.id,
          roomId: input.auction.roomId,
          clientBidId: input.clientBidId,
          metadata: {
            amountFen: input.atomic.amountFen,
            serverSeq: input.atomic.serverSeq,
            redisRollbackSucceeded: rollbackSucceeded,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      });
    } catch (auditError: unknown) {
      this.logger.warn(
        `Failed to write bid persistence audit log: ${
          auditError instanceof Error ? auditError.message : String(auditError)
        }`
      );
    }
  }
}

function assertAuctionCanReceiveBid(auction: AuctionForBid, now: Date): void {
  if (auction.status === PrismaAuctionStatus.CANCELLED) {
    throw conflict(AuctionErrorCode.AuctionCancelled, "竞拍已取消", {
      auctionId: auction.id,
      status: auction.status
    });
  }

  if (
    auction.status === PrismaAuctionStatus.ENDED_SOLD ||
    auction.status === PrismaAuctionStatus.ENDED_UNSOLD
  ) {
    throw conflict(AuctionErrorCode.AuctionAlreadyEnded, "竞拍已结束", {
      auctionId: auction.id,
      status: auction.status
    });
  }

  if (auction.status !== PrismaAuctionStatus.RUNNING) {
    throw conflict(AuctionErrorCode.AuctionNotRunning, "竞拍未开始", {
      auctionId: auction.id,
      status: auction.status
    });
  }

  if (!auction.endTime) {
    throw conflict(AuctionErrorCode.InvalidAuctionTransition, "竞拍缺少结束时间", {
      auctionId: auction.id,
      status: auction.status
    });
  }

  if (now.getTime() > auction.endTime.getTime()) {
    throw conflict(AuctionErrorCode.AuctionAlreadyEnded, "竞拍已到结束时间", {
      auctionId: auction.id,
      endTime: auction.endTime.toISOString(),
      serverTime: now.toISOString()
    });
  }
}

function throwAtomicRejection(
  rejection: AtomicBidRejected,
  clientBidId: string
): never {
  throw conflict(rejection.code, toUserMessage(rejection.code), {
    auctionId: rejection.auctionId,
    clientBidId,
    currentPriceFen: rejection.currentPriceFen,
    highestBidderId: rejection.highestBidderId,
    endTimeMs: rejection.endTimeMs
  });
}

function toUserMessage(code: AuctionErrorCode): string {
  switch (code) {
    case AuctionErrorCode.AuctionCancelled:
      return "竞拍已取消";
    case AuctionErrorCode.AuctionAlreadyEnded:
      return "竞拍已结束";
    case AuctionErrorCode.AuctionNotRunning:
      return "竞拍未开始";
    case AuctionErrorCode.BidAmountTooLow:
      return "出价必须高于当前价";
    case AuctionErrorCode.BidIncrementInvalid:
      return "出价不符合固定加价幅度";
    case AuctionErrorCode.BidExceedsCapPrice:
      return "出价不能超过封顶价";
    case AuctionErrorCode.BidderAlreadyLeading:
      return "当前您已是最高价";
    case AuctionErrorCode.DuplicateClientBid:
      return "该 clientBidId 已处理";
    default:
      return "出价失败";
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function auctionBidLockKey(auctionId: string): string {
  return `auction:${auctionId}:bid_lock`;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
