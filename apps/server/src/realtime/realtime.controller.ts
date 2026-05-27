import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import {
  BidderDemoAuthGuard,
  type DemoRequest
} from "../common/demo-auth.guard";
import { AuctionSnapshotService } from "./auction-snapshot.service";

@Controller()
@UseGuards(BidderDemoAuthGuard)
export class RealtimeController {
  constructor(private readonly snapshots: AuctionSnapshotService) {}

  @Get("rooms/:roomId/auctions")
  listRoomAuctions(@Param("roomId") roomId: string) {
    return this.snapshots.listRoomAuctions(roomId);
  }

  @Get("auctions/:auctionId")
  getAuction(@Param("auctionId") auctionId: string) {
    return this.snapshots.getAuctionDetail(auctionId);
  }

  @Get("auctions/:auctionId/snapshot")
  getSnapshot(
    @Param("auctionId") auctionId: string,
    @Req() request: DemoRequest
  ) {
    return this.snapshots.getSnapshot(auctionId, request.demoUser?.userId ?? "");
  }
}
