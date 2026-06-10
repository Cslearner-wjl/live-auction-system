import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  AdminDemoAuthGuard,
  BidderDemoAuthGuard,
  type DemoRequest
} from "../common/demo-auth.guard";
import { AiAuctionInsightService } from "./ai-auction-insight.service";
import type { GenerateAiAuctionInsightPayload } from "./dto/generate-ai-auction-insight.dto";

@Controller()
export class AiController {
  constructor(
    @Inject(AiAuctionInsightService)
    private readonly aiInsights: AiAuctionInsightService
  ) {}

  @Post("admin/ai/auction-insights")
  @UseGuards(AdminDemoAuthGuard)
  generateAuctionInsight(
    @Body() body: GenerateAiAuctionInsightPayload,
    @Req() request: DemoRequest
  ) {
    return this.aiInsights.generateInsight(body, request.demoUser?.userId);
  }

  @Get("auctions/:auctionId/ai-insight")
  @UseGuards(BidderDemoAuthGuard)
  getAuctionInsight(@Param("auctionId") auctionId: string) {
    return this.aiInsights.getPublicInsight(auctionId);
  }
}
