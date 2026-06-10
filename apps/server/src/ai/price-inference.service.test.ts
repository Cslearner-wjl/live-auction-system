import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PriceInferenceService } from "./price-inference.service";
import type { GenerateAiAuctionInsightValues } from "./dto/ai-auction-insight.response";

describe("PriceInferenceService", () => {
  const service = new PriceInferenceService();

  it("uses referenceMarketPriceFen when provided", () => {
    const result = service.infer(
      makeInput({
        optionalMarketInfo: {
          referenceMarketPriceFen: 59900
        }
      })
    );

    assert.equal(result.basePriceFen, 59900);
    assert.equal(result.suggestedDealMinFen, 29950);
    assert.equal(result.suggestedDealMaxFen, 65890);
  });

  it("uses costPriceFen multiplied by 1.8 when reference price is absent", () => {
    const result = service.infer(
      makeInput({
        optionalMarketInfo: {
          costPriceFen: 26000
        }
      })
    );

    assert.equal(result.basePriceFen, 46800);
    assert.equal(result.suggestedDealMinFen, 23400);
  });

  it("falls back to capPriceFen multiplied by 0.7 when no market price exists", () => {
    const result = service.infer(makeInput());

    assert.equal(result.basePriceFen, 69930);
  });

  it("keeps zero start price valid", () => {
    const result = service.infer(
      makeInput({
        auctionRule: {
          startPriceFen: 0,
          incrementFen: 1000,
          durationSeconds: 300,
          capPriceFen: 100000,
          antiSnipingWindowSeconds: 10,
          extensionSeconds: 15,
          maxExtensionCount: 3
        }
      })
    );

    assert.equal(result.suggestedStartPriceFen, 0);
    assert.equal(result.suggestedDealMinFen >= 0, true);
  });

  it("returns integer Fen values and never suggests deal max above cap price", () => {
    const result = service.infer(
      makeInput({
        optionalMarketInfo: {
          referenceMarketPriceFen: 12345
        }
      })
    );

    for (const value of Object.values(result)) {
      assert.equal(Number.isInteger(value), true);
    }
    assert.equal(result.suggestedDealMaxFen <= 99900, true);
  });
});

function makeInput(
  overrides: Partial<GenerateAiAuctionInsightValues> = {}
): GenerateAiAuctionInsightValues {
  return {
    itemName: "紫砂茶具套装",
    description: "一壶四杯，适合日常泡茶和送礼",
    sellingPoints: ["手工", "茶具"],
    auctionRule: {
      startPriceFen: 0,
      incrementFen: 2000,
      durationSeconds: 300,
      capPriceFen: 99900,
      antiSnipingWindowSeconds: 10,
      extensionSeconds: 15,
      maxExtensionCount: 3
    },
    ...overrides
  };
}
