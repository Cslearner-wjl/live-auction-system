import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionStatus as PrismaAuctionStatus,
  type AuctionSession
} from "@prisma/client";
import { AuctionErrorCode } from "@live-auction/shared";
import { conflict } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { AuctionSchedulerService } from "./auction-scheduler.service";
import { AuctionStateMachineService } from "./auction-state-machine.service";

interface FindManyArgs {
  where: {
    status: PrismaAuctionStatus;
  };
  select: {
    id: boolean;
    status: boolean;
    endTime: boolean;
  };
}

interface FindUniqueArgs {
  where: {
    id: string;
  };
  select: {
    id: boolean;
    status: boolean;
    endTime: boolean;
  };
}

class FakeSchedulerPrisma {
  auction: Pick<AuctionSession, "id" | "status" | "endTime"> = {
    id: "auction_1",
    status: PrismaAuctionStatus.RUNNING,
    endTime: new Date(Date.now() - 1_000)
  };

  readonly auctionSession = {
    findMany: async (_args: FindManyArgs) => [this.auction],
    findUnique: async (_args: FindUniqueArgs) => this.auction
  };
}

class FakeStateMachine {
  finishCalls = 0;

  async finishAuction(auctionId: string): Promise<void> {
    this.finishCalls += 1;

    if (this.finishCalls === 1) {
      throw conflict(AuctionErrorCode.InvalidAuctionTransition, "竞拍尚未到结束时间", {
        auctionId,
        status: PrismaAuctionStatus.RUNNING
      });
    }
  }
}

describe("AuctionSchedulerService", () => {
  it("retries when an end timer fires before the state machine accepts settlement", async () => {
    const prisma = new FakeSchedulerPrisma();
    const stateMachine = new FakeStateMachine();
    const scheduler = new AuctionSchedulerService(
      prisma as unknown as PrismaService,
      stateMachine as unknown as AuctionStateMachineService
    );

    await callFinishFromTimer(scheduler, "auction_1");
    await waitFor(() => stateMachine.finishCalls >= 2);
    scheduler.onModuleDestroy();

    assert.equal(stateMachine.finishCalls, 2);
  });
});

function callFinishFromTimer(
  scheduler: AuctionSchedulerService,
  auctionId: string
): Promise<void> {
  return (
    scheduler as unknown as {
      finishFromTimer(auctionId: string): Promise<void>;
    }
  ).finishFromTimer(auctionId);
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for scheduler retry");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
