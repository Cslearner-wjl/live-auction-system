import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  AuctionEventType as PrismaAuctionEventType,
  OutboxStatus as PrismaOutboxStatus,
  type AuctionEvent
} from "@prisma/client";
import { AuctionWebSocketEvent } from "@live-auction/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuctionRealtimeGateway } from "./auction-realtime.gateway";

type PublishTimer = ReturnType<typeof setInterval> & {
  unref?: () => void;
};

type JsonObject = Record<string, unknown>;

@Injectable()
export class AuctionEventPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuctionEventPublisherService.name);
  private timer: PublishTimer | null = null;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuctionRealtimeGateway)
    private readonly gateway: AuctionRealtimeGateway
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.publishPendingOnce();
    }, 500) as PublishTimer;
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async publishPendingOnce(limit = 50): Promise<{ published: number; failed: number }> {
    const events = await this.prisma.auctionEvent.findMany({
      where: {
        outboxStatus: {
          in: [PrismaOutboxStatus.PENDING, PrismaOutboxStatus.FAILED]
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      take: limit
    });
    let published = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await this.publishEvent(event);
        await this.prisma.auctionEvent.updateMany({
          where: {
            id: event.id,
            outboxStatus: {
              in: [PrismaOutboxStatus.PENDING, PrismaOutboxStatus.FAILED]
            }
          },
          data: {
            outboxStatus: PrismaOutboxStatus.PUBLISHED,
            publishedAt: new Date()
          }
        });
        published += 1;
      } catch (error: unknown) {
        failed += 1;
        await this.markFailed(event, error);
      }
    }

    return {
      published,
      failed
    };
  }

  async publishEvent(event: AuctionEvent): Promise<void> {
    const payload = asObject(event.payload);

    switch (event.type) {
      case PrismaAuctionEventType.BID_ACCEPTED:
        await this.publishBidAccepted(event, payload);
        return;
      case PrismaAuctionEventType.AUCTION_STARTED:
        this.gateway.emitAuctionAndRoomEvent(
          event.roomId,
          event.auctionId,
          AuctionWebSocketEvent.AuctionStarted,
          withMeta(event, payload)
        );
        return;
      case PrismaAuctionEventType.AUCTION_ENDED:
        await this.publishAuctionEnded(event, payload);
        return;
      case PrismaAuctionEventType.ORDER_CREATED:
        this.publishOrderCreated(event, payload);
        return;
      case PrismaAuctionEventType.AUCTION_CANCELLED:
        this.gateway.emitAuctionAndRoomEvent(
          event.roomId,
          event.auctionId,
          AuctionWebSocketEvent.AuctionCancelled,
          withMeta(event, payload)
        );
        return;
      default:
        throw new Error(`Unsupported auction event type for outbox publishing: ${event.type}`);
    }
  }

  private async publishBidAccepted(event: AuctionEvent, payload: JsonObject): Promise<void> {
    const base = withMeta(event, payload);
    const highestBidderId = readOptionalString(payload.highestBidderId);
    const previousHighestBidderId = readOptionalString(payload.previousHighestBidderId);
    const currentPriceFen = readOptionalNumber(payload.currentPriceFen);
    const amountFen = readOptionalNumber(payload.amountFen);
    const maskedName = highestBidderId
      ? await this.getMaskedName(highestBidderId)
      : null;

    this.gateway.emitAuctionEvent(
      event.auctionId,
      AuctionWebSocketEvent.BidAccepted,
      {
        ...base,
        bidId: readOptionalString(payload.bidId),
        userId: highestBidderId,
        highestBidderId,
        maskedName,
        amountFen,
        currentPriceFen,
        previousPriceFen: readOptionalNumber(payload.previousPriceFen),
        previousHighestBidderId,
        bidCount: readOptionalNumber(payload.bidCount),
        endTime: readOptionalString(payload.endTime),
        extended: Boolean(payload.extended),
        reachedCapPrice: Boolean(payload.reachedCapPrice)
      }
    );

    if (highestBidderId) {
      this.gateway.emitUserEvent(
        highestBidderId,
        AuctionWebSocketEvent.Leading,
        {
          ...base,
          eventId: `${event.id}:leading`,
          amountFen,
          message: "当前您已是最高价"
        }
      );
    }

    if (previousHighestBidderId && previousHighestBidderId !== highestBidderId) {
      this.gateway.emitUserEvent(
        previousHighestBidderId,
        AuctionWebSocketEvent.Outbid,
        {
          ...base,
          eventId: `${event.id}:outbid`,
          currentPriceFen,
          message: "你已被超越"
        }
      );
    }

    if (payload.extended === true) {
      this.gateway.emitAuctionEvent(
        event.auctionId,
        AuctionWebSocketEvent.AuctionExtended,
        {
          ...base,
          eventId: `${event.id}:extended`,
          oldEndTime: readOptionalString(payload.oldEndTime),
          newEndTime: readOptionalString(payload.endTime),
          extendedCount: readOptionalNumber(payload.extendedCount)
        }
      );
    }
  }

  private async publishAuctionEnded(event: AuctionEvent, payload: JsonObject): Promise<void> {
    const winnerId = readOptionalString(payload.winnerId);
    const winnerMaskedName = winnerId ? await this.getMaskedName(winnerId) : null;

    this.gateway.emitAuctionAndRoomEvent(
      event.roomId,
      event.auctionId,
      AuctionWebSocketEvent.AuctionEnded,
      {
        ...withMeta(event, payload),
        winnerMaskedName
      }
    );
  }

  private publishOrderCreated(event: AuctionEvent, payload: JsonObject): void {
    const buyerId = readOptionalString(payload.buyerId);

    if (!buyerId) {
      throw new Error(`ORDER_CREATED event ${event.id} missing buyerId`);
    }

    this.gateway.emitUserEvent(
      buyerId,
      AuctionWebSocketEvent.OrderCreated,
      withMeta(event, payload)
    );
  }

  private async getMaskedName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        maskedName: true
      }
    });

    return user?.maskedName ?? null;
  }

  private async markFailed(event: AuctionEvent, error: unknown): Promise<void> {
    await this.prisma.auctionEvent.update({
      where: { id: event.id },
      data: {
        outboxStatus: PrismaOutboxStatus.FAILED
      }
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          action: "AUCTION_EVENT_PUBLISH_FAILED",
          auctionId: event.auctionId,
          roomId: event.roomId,
          eventId: event.id,
          metadata: {
            type: event.type,
            serverSeq: event.serverSeq,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      });
    } catch (auditError: unknown) {
      this.logger.warn(
        `Failed to write outbox failure audit: ${
          auditError instanceof Error ? auditError.message : String(auditError)
        }`
      );
    }
  }
}

function withMeta(event: AuctionEvent, payload: JsonObject): JsonObject {
  return {
    ...payload,
    eventId: event.id,
    auctionId: event.auctionId,
    roomId: event.roomId,
    serverSeq: event.serverSeq,
    serverTime: readOptionalString(payload.serverTime) ?? event.createdAt.toISOString()
  };
}

function asObject(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
