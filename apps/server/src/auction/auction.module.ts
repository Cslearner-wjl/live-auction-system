import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuctionStateMachineService } from "./auction-state-machine.service";

@Module({
  imports: [PrismaModule],
  providers: [AuctionStateMachineService],
  exports: [AuctionStateMachineService]
})
export class AuctionModule {}
