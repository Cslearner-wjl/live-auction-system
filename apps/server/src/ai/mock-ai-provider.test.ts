import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeAiAuctionInsightOutput } from "./ai-output.schema";
import { MockAiProvider } from "./mock-ai-provider";
import { PriceInferenceService } from "./price-inference.service";
import type { AiProviderInput } from "./dto/ai-auction-insight.response";

describe("MockAiProvider", () => {
  it("returns deterministic output for the same input", async () => {
    const provider = new MockAiProvider();
    const input = makeInput();

    const first = await provider.generate(input);
    const second = await provider.generate(input);

    assert.deepEqual(first, second);
  });

  it("includes risk reminders and passes schema validation", async () => {
    const provider = new MockAiProvider();
    const output = await provider.generate(makeInput());
    const normalized = normalizeAiAuctionInsightOutput(output, "mock");

    assert.equal(normalized.source, "mock");
    assert.ok(normalized.riskNotes.some((note) => note.includes("价格仅供参考")));
    assert.ok(normalized.targetAudience.includes("茶文化爱好者"));
  });
});

function makeInput(): AiProviderInput {
  const values = {
    itemName: "紫砂茶具套装",
    description: "手工制作，一壶四杯，适合日常泡茶和送礼",
    sellingPoints: ["手工", "茶具"],
    roomId: "room_1",
    auctionRule: {
      startPriceFen: 0,
      incrementFen: 2000,
      durationSeconds: 300,
      capPriceFen: 89900,
      antiSnipingWindowSeconds: 10,
      extensionSeconds: 15,
      maxExtensionCount: 3
    },
    optionalMarketInfo: {
      referenceMarketPriceFen: 59900,
      targetAudienceHint: "茶文化爱好者"
    }
  };

  return {
    ...values,
    priceRange: new PriceInferenceService().infer(values)
  };
}
