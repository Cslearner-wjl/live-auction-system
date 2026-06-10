import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiAuctionInsightService } from "./ai-auction-insight.service";
import { AiController } from "./ai.controller";
import { MockAiProvider } from "./mock-ai-provider";
import { OpenAiProvider } from "./openai-ai-provider";
import { PriceInferenceService } from "./price-inference.service";

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [
    AiAuctionInsightService,
    PriceInferenceService,
    MockAiProvider,
    OpenAiProvider
  ],
  exports: [AiAuctionInsightService, PriceInferenceService, MockAiProvider, OpenAiProvider]
})
export class AiModule {}
