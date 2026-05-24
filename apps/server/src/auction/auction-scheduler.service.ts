import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  AuctionStatus as PrismaAuctionStatus,
  type AuctionSession
} from "@prisma/client";
import { AuctionStateMachineService } from "./auction-state-machine.service";
import { PrismaService } from "../prisma/prisma.service";

type AuctionEndTimer = ReturnType<typeof setTimeout> & {
  unref?: () => void;
};

type SchedulableAuction = Pick<AuctionSession, "id" | "status" | "endTime">;

@Injectable()
export class AuctionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuctionSchedulerService.name);
  private readonly endTimers = new Map<string, AuctionEndTimer>();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuctionStateMachineService)
    private readonly stateMachine: AuctionStateMachineService
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.restoreRunningAuctions();
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to restore auction end timers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  onModuleDestroy(): void {
    for (const auctionId of this.endTimers.keys()) {
      this.clearEndTimer(auctionId);
    }
  }

  async restoreRunningAuctions(now = new Date()): Promise<void> {
    const auctions = await this.prisma.auctionSession.findMany({
      where: {
        status: PrismaAuctionStatus.RUNNING
      },
      select: {
        id: true,
        status: true,
        endTime: true
      }
    });

    for (const auction of auctions) {
      this.scheduleEndTimer(auction, now);
    }
  }

  scheduleEndTimer(auction: SchedulableAuction, now = new Date()): void {
    if (auction.status !== PrismaAuctionStatus.RUNNING) {
      return;
    }

    this.clearEndTimer(auction.id);

    if (!auction.endTime) {
      this.logger.warn(`Cannot schedule auction ${auction.id}: missing endTime`);
      return;
    }

    const delayMs = auction.endTime.getTime() - now.getTime();

    if (delayMs <= 0) {
      void this.finishFromTimer(auction.id);
      return;
    }

    const timer = setTimeout(() => {
      void this.finishFromTimer(auction.id);
    }, delayMs) as AuctionEndTimer;

    timer.unref?.();
    this.endTimers.set(auction.id, timer);
  }

  clearEndTimer(auctionId: string): void {
    const timer = this.endTimers.get(auctionId);

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.endTimers.delete(auctionId);
  }

  private async finishFromTimer(auctionId: string): Promise<void> {
    this.clearEndTimer(auctionId);

    try {
      await this.stateMachine.finishAuction(auctionId);
    } catch (error: unknown) {
      this.logger.warn(
        `Auction ${auctionId} finish timer skipped: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
