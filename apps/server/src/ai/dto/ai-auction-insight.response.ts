import type { AuctionRuleValues } from "../../auction/auction-rule.validation";

export type AiInsightSource = "mock" | "openai" | "ark" | "fallback";
export type AiInsightConfidence = "low" | "medium" | "high";

export interface OptionalMarketInfoValues {
  costPriceFen?: number;
  referenceMarketPriceFen?: number;
  condition?: string;
  brandOrOrigin?: string;
  targetAudienceHint?: string;
}

export interface PriceInferenceResult {
  basePriceFen: number;
  suggestedStartPriceFen: number;
  suggestedDealMinFen: number;
  suggestedDealMaxFen: number;
  suggestedCapPriceFen: number;
  cautionPriceFen: number;
}

export interface AiAuctionInsightCore {
  source: AiInsightSource;
  targetAudience: string[];
  sellingPointTags: string[];
  suggestedStartPriceFen: number;
  suggestedDealMinFen: number;
  suggestedDealMaxFen: number;
  suggestedCapPriceFen: number;
  cautionPriceFen: number;
  priceReasoning: string;
  liveScript: string;
  atmosphereCopy: string;
  riskNotes: string[];
  confidence: AiInsightConfidence;
}

export interface AdminAiAuctionInsightResponse extends AiAuctionInsightCore {
  id: string;
  itemId: string | null;
  auctionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAiAuctionInsightResponse {
  source: AiInsightSource;
  targetAudience: string[];
  suggestedDealMinFen: number;
  suggestedDealMaxFen: number;
  cautionPriceFen: number;
  riskNotes: string[];
  confidence: AiInsightConfidence;
}

export interface GenerateAiAuctionInsightValues {
  itemName: string;
  description: string;
  sellingPoints: string[];
  roomId?: string;
  auctionRule: AuctionRuleValues;
  optionalMarketInfo?: OptionalMarketInfoValues;
}

export interface AiProviderInput extends GenerateAiAuctionInsightValues {
  priceRange: PriceInferenceResult;
}
