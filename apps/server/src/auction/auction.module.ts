import { Module } from "@nestjs/common";
import { RedisModule } from "../cache/redis.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuctionConsistencyService } from "./auction-consistency.service";
import { AuctionSchedulerService } from "./auction-scheduler.service";
import { AuctionStateMachineService } from "./auction-state-machine.service";

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [AuctionStateMachineService, AuctionSchedulerService, AuctionConsistencyService],
  exports: [AuctionStateMachineService, AuctionSchedulerService]
})
export class AuctionModule {}
