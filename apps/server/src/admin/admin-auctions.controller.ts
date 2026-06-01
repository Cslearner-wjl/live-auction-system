import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { type AuctionRulePayload } from "../auction/auction-rule.validation";
import {
  AdminDemoAuthGuard,
  type DemoRequest
} from "../common/demo-auth.guard";
import { AdminAuctionsService } from "./admin-auctions.service";
import {
  type CancelAuctionPayload,
  type CreateAuctionPayload,
  type CreateAuctionWithItemPayload
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

  @Post("with-item")
  async createAuctionWithItem(
    @Body() body: CreateAuctionWithItemPayload,
    @Req() request: DemoRequest
  ) {
    return this.auctionsService.createAuctionWithItem(
      body,
      request.demoUser?.userId ?? ""
    );
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
  @HttpCode(HttpStatus.OK)
  async startAuction(@Param("auctionId") auctionId: string) {
    return this.auctionsService.startAuction(auctionId);
  }

  @Post(":auctionId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancelAuction(
    @Param("auctionId") auctionId: string,
    @Body() body: CancelAuctionPayload
  ) {
    return this.auctionsService.cancelAuction(auctionId, body);
  }
}
