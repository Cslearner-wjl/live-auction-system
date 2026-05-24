import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuctionSchedulerService } from "./auction-scheduler.service";
import { AuctionStateMachineService } from "./auction-state-machine.service";

@Module({
  imports: [PrismaModule],
  providers: [AuctionStateMachineService, AuctionSchedulerService],
  exports: [AuctionStateMachineService, AuctionSchedulerService]
})
export class AuctionModule {}
