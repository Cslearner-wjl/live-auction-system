import { Inject, Injectable } from "@nestjs/common";
import {
  AuctionStatus as PrismaAuctionStatus,
  type AuctionSession
} from "@prisma/client";
import {
  AuctionErrorCode,
  AuctionStatus,
  allowedAuctionTransitions
} from "@live-auction/shared";
import { conflict, notFound } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";

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
