import { Injectable } from "@nestjs/common";
import type {
  GenerateAiAuctionInsightValues,
  OptionalMarketInfoValues,
  PriceInferenceResult
} from "./dto/ai-auction-insight.response";

@Injectable()
export class PriceInferenceService {
  infer(input: GenerateAiAuctionInsightValues): PriceInferenceResult {
    const { auctionRule, optionalMarketInfo } = input;
    const basePriceFen = inferBasePriceFen(optionalMarketInfo, auctionRule.capPriceFen);
    const suggestedDealMinFen = Math.max(
      auctionRule.startPriceFen,
      multiplyRatio(basePriceFen, 1, 2)
    );
    const suggestedDealMaxFen = Math.max(
      suggestedDealMinFen,
      Math.min(auctionRule.capPriceFen, multiplyRatio(basePriceFen, 11, 10))
    );
    const cautionPriceFen = Math.max(
      suggestedDealMaxFen,
      Math.min(auctionRule.capPriceFen, multiplyRatio(basePriceFen, 12, 10))
    );
    const suggestedCapPriceFen = Math.max(
      suggestedDealMaxFen,
      Math.min(auctionRule.capPriceFen, multiplyRatio(basePriceFen, 13, 10))
    );

    return {
      basePriceFen,
      suggestedStartPriceFen: inferSuggestedStartPriceFen(
        auctionRule.startPriceFen,
        basePriceFen
      ),
      suggestedDealMinFen,
      suggestedDealMaxFen,
      suggestedCapPriceFen,
      cautionPriceFen
    };
  }
}

function inferBasePriceFen(
  marketInfo: OptionalMarketInfoValues | undefined,
  capPriceFen: number
): number {
  if (marketInfo?.referenceMarketPriceFen !== undefined) {
    return marketInfo.referenceMarketPriceFen;
  }

  if (marketInfo?.costPriceFen !== undefined) {
    return multiplyRatio(marketInfo.costPriceFen, 18, 10);
  }

  return multiplyRatio(capPriceFen, 7, 10);
}

function inferSuggestedStartPriceFen(startPriceFen: number, basePriceFen: number): number {
  const highStartThresholdFen = multiplyRatio(basePriceFen, 8, 10);

  if (startPriceFen > highStartThresholdFen) {
    return Math.max(0, multiplyRatio(basePriceFen, 3, 10));
  }

  return startPriceFen;
}

function multiplyRatio(value: number, numerator: number, denominator: number): number {
  return Math.round((value * numerator) / denominator);
}
