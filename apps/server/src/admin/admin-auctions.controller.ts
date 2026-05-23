import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { type AuctionRulePayload } from "../auction/auction-rule.validation";
import { AdminDemoAuthGuard } from "../common/demo-auth.guard";
import { AdminAuctionsService } from "./admin-auctions.service";
import {
  type CancelAuctionPayload,
  type CreateAuctionPayload
} from "./auction.validation";

@Controller("admin/auctions")
@UseGuards(AdminDemoAuthGuard)
export class AdminAuctionsController {
  constructor(
    @Inject(AdminAuctionsService)
    private readonly auctionsService: AdminAuctionsService
  ) {}

  @Post()
  async createAuction(@Body() body: CreateAuctionPayload) {
    return this.auctionsService.createAuction(body);
  }

  @Get()
  async listAuctions(@Query() query: Record<string, unknown>) {
    return this.auctionsService.listAuctions(query);
  }

  @Get(":auctionId")
  async getAuction(@Param("auctionId") auctionId: string) {
    return this.auctionsService.getAuction(auctionId);
  }

  @Patch(":auctionId/rules")
  async updateRules(
    @Param("auctionId") auctionId: string,
    @Body() body: AuctionRulePayload
  ) {
    return this.auctionsService.updateRules(auctionId, body);
  }

  @Post(":auctionId/start")
  async startAuction(@Param("auctionId") auctionId: string) {
    return this.auctionsService.startAuction(auctionId);
  }

  @Post(":auctionId/cancel")
  async cancelAuction(
    @Param("auctionId") auctionId: string,
    @Body() body: CancelAuctionPayload
  ) {
    return this.auctionsService.cancelAuction(auctionId, body);
  }
}
