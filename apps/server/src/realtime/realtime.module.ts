import { Module } from "@nestjs/common";
import { BidModule } from "../bid/bid.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuctionEventPublisherService } from "./auction-event-publisher.service";
import { AuctionRealtimeGateway } from "./auction-realtime.gateway";
import { AuctionSnapshotService } from "./auction-snapshot.service";
import { RealtimeController } from "./realtime.controller";

@Module({
  imports: [PrismaModule, BidModule],
  controllers: [RealtimeController],
  providers: [
    AuctionSnapshotService,
    AuctionRealtimeGateway,
    AuctionEventPublisherService
  ],
  exports: [AuctionSnapshotService, AuctionEventPublisherService]
})
export class RealtimeModule {}
