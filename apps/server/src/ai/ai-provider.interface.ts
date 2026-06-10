import type {
  AiAuctionInsightCore,
  AiProviderInput
} from "./dto/ai-auction-insight.response";

export interface AiProvider {
  generate(input: AiProviderInput): Promise<AiAuctionInsightCore>;
}
