import { Inject, Injectable } from "@nestjs/common";
import {
  AuctionStatus as PrismaAuctionStatus,
  type AuctionSession,
  OrderStatus as PrismaOrderStatus,
  type Order
} from "@prisma/client";
import {
  AuctionErrorCode,
  AuctionStatus,
  allowedAuctionTransitions
} from "@live-auction/shared";
import { conflict, notFound } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";

export interface FinishAuctionOptions {
  now?: Date;
  enforceEndTime?: boolean;
}

export interface FinishAuctionResult {
  auction: AuctionSession;
  order: Order | null;
}

@Injectable()
export class AuctionStateMachineService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async startAuction(auctionId: string): Promise<AuctionSession> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: auctionId },
      include: { rule: true }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
    }

    assertAuctionTransition(
      auction.status as AuctionStatus,
      AuctionStatus.Running,
      auctionId
    );

    const now = new Date();
    const endTime = new Date(now.getTime() + auction.rule.durationSeconds * 1000);

    const updated = await this.prisma.auctionSession.updateMany({
      where: {
        id: auctionId,
        status: PrismaAuctionStatus.SCHEDULED
      },
      data: {
        status: PrismaAuctionStatus.RUNNING,
        startTime: now,
        endTime,
        version: {
          increment: 1
        }
      }
    });

    if (updated.count !== 1) {
      throw invalidTransition(auction.status as AuctionStatus, AuctionStatus.Running, auctionId);
    }

    return this.prisma.auctionSession.findUniqueOrThrow({
      where: { id: auctionId }
    });
  }

  async cancelAuction(auctionId: string): Promise<AuctionSession> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: auctionId }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
    }

    assertAuctionTransition(
      auction.status as AuctionStatus,
      AuctionStatus.Cancelled,
      auctionId
    );

    const updated = await this.prisma.auctionSession.updateMany({
      where: {
        id: auctionId,
        status: {
          in: [PrismaAuctionStatus.SCHEDULED, PrismaAuctionStatus.RUNNING]
        }
      },
      data: {
        status: PrismaAuctionStatus.CANCELLED,
        version: {
          increment: 1
        }
      }
    });

    if (updated.count !== 1) {
      throw invalidTransition(auction.status as AuctionStatus, AuctionStatus.Cancelled, auctionId);
    }

    return this.prisma.auctionSession.findUniqueOrThrow({
      where: { id: auctionId }
    });
  }

  async finishAuction(
    auctionId: string,
    options: FinishAuctionOptions = {}
  ): Promise<FinishAuctionResult> {
    return this.settleAuction(auctionId, options);
  }

  async settleSoldAuction(
    auctionId: string,
    options: FinishAuctionOptions = {}
  ): Promise<FinishAuctionResult> {
    return this.settleAuction(
      auctionId,
      {
        ...options,
        enforceEndTime: options.enforceEndTime ?? false
      },
      AuctionStatus.EndedSold
    );
  }

  async settleUnsoldAuction(
    auctionId: string,
    options: FinishAuctionOptions = {}
  ): Promise<FinishAuctionResult> {
    return this.settleAuction(auctionId, options, AuctionStatus.EndedUnsold);
  }

  private async settleAuction(
    auctionId: string,
    options: FinishAuctionOptions,
    expectedStatus?: AuctionStatus.EndedSold | AuctionStatus.EndedUnsold
  ): Promise<FinishAuctionResult> {
    const now = options.now ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const auction = await tx.auctionSession.findUnique({
        where: { id: auctionId }
      });

      if (!auction) {
        throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
      }

      if (options.enforceEndTime !== false) {
        assertAuctionEndTimeReached(auction, now);
      }

      const to = auction.highestBidderId
        ? AuctionStatus.EndedSold
        : AuctionStatus.EndedUnsold;
      const targetStatus = expectedStatus ?? to;

      if (targetStatus === AuctionStatus.EndedSold && !auction.highestBidderId) {
        throw conflict(AuctionErrorCode.InvalidAuctionTransition, "成交竞拍缺少最高出价人", {
          auctionId
        });
      }

      if (targetStatus === AuctionStatus.EndedUnsold && auction.highestBidderId) {
        throw conflict(AuctionErrorCode.InvalidAuctionTransition, "已有最高出价人，不能流拍", {
          auctionId,
          highestBidderId: auction.highestBidderId
        });
      }

      assertAuctionTransition(auction.status as AuctionStatus, targetStatus, auctionId);

      const updated = await tx.auctionSession.updateMany({
        where: {
          id: auctionId,
          status: PrismaAuctionStatus.RUNNING
        },
        data: {
          status: targetStatus as PrismaAuctionStatus,
          version: {
            increment: 1
          }
        }
      });

      if (updated.count !== 1) {
        throw invalidTransition(auction.status as AuctionStatus, targetStatus, auctionId);
      }

      const order = targetStatus === AuctionStatus.EndedSold && auction.highestBidderId
        ? await tx.order.create({
            data: {
              auctionId,
              itemId: auction.itemId,
              buyerId: auction.highestBidderId,
              amountFen: auction.currentPriceFen,
              status: PrismaOrderStatus.PENDING_PAYMENT
            }
          })
        : null;

      const settledAuction = await tx.auctionSession.findUniqueOrThrow({
        where: { id: auctionId }
      });

      return {
        auction: settledAuction,
        order
      };
    });
  }
}

export function assertAuctionTransition(
  from: AuctionStatus,
  to: AuctionStatus,
  auctionId: string
): void {
  if (!allowedAuctionTransitions[from]?.includes(to)) {
    throw invalidTransition(from, to, auctionId);
  }
}

function invalidTransition(
  from: AuctionStatus,
  to: AuctionStatus,
  auctionId: string
) {
  return conflict(AuctionErrorCode.InvalidAuctionTransition, "竞拍状态流转不合法", {
    auctionId,
    from,
    to
  });
}

function assertAuctionEndTimeReached(
  auction: AuctionSession,
  now: Date
): void {
  if (!auction.endTime) {
    throw conflict(AuctionErrorCode.InvalidAuctionTransition, "竞拍缺少结束时间", {
      auctionId: auction.id,
      status: auction.status
    });
  }

  if (auction.endTime.getTime() > now.getTime()) {
    throw conflict(AuctionErrorCode.InvalidAuctionTransition, "竞拍尚未到结束时间", {
      auctionId: auction.id,
      status: auction.status,
      endTime: auction.endTime.toISOString(),
      serverTime: now.toISOString()
    });
  }
}
