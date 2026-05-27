import {
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  BidderDemoAuthGuard,
  type DemoRequest
} from "../common/demo-auth.guard";
import { BidService } from "./bid.service";
import { type PlaceBidPayload } from "./bid.validation";

@Controller("auctions")
@UseGuards(BidderDemoAuthGuard)
export class BidController {
  constructor(
    @Inject(BidService)
    private readonly bidService: BidService
  ) {}

  @Post(":auctionId/bids")
  async placeBid(
    @Param("auctionId") auctionId: string,
    @Body() body: PlaceBidPayload,
    @Req() request: DemoRequest
  ) {
    return this.bidService.placeBid(auctionId, request.demoUser!.userId, body);
  }
}
