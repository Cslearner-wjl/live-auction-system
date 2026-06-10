import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpenAiProvider } from "./openai-ai-provider";
import { PriceInferenceService } from "./price-inference.service";
import type { AiProviderInput } from "./dto/ai-auction-insight.response";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

describe("OpenAiProvider", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AI_API_KEY = "test-api-key";
    process.env.AI_MAX_RETRIES = "0";
    process.env.AI_TIMEOUT_MS = "1000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("uses Responses API by default for OpenAI provider", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-4.1-mini";
    const requests: CapturedRequest[] = [];
    mockFetch(requests, {
      output_text: JSON.stringify(makeModelOutput())
    });

    const result = await new OpenAiProvider().generate(makeInput());

    assert.equal(result.source, "openai");
    assert.equal(requests[0]?.url, "https://api.openai.com/v1/responses");
    assert.equal(requests[0]?.body.model, "gpt-4.1-mini");
    assert.equal(requests[0]?.body.text.format.type, "json_schema");
  });

  it("uses Ark Chat Completions defaults and endpoint model ids", async () => {
    process.env.AI_PROVIDER = "ark";
    process.env.AI_MODEL = "ep-20260514111437-7crsm";
    const input = makeInput();
    const requests: CapturedRequest[] = [];
    mockFetch(requests, {
      choices: [
        {
          message: {
            content: `\`\`\`json\n${JSON.stringify({
              ...makeModelOutput(),
              suggestedStartPriceFen: "not-a-number",
              suggestedDealMinFen: "not-a-number"
            })}\n\`\`\``
          }
        }
      ]
    });

    const result = await new OpenAiProvider().generate(input);

    assert.equal(result.source, "ark");
    assert.equal(result.suggestedStartPriceFen, input.priceRange.suggestedStartPriceFen);
    assert.equal(result.suggestedDealMinFen, input.priceRange.suggestedDealMinFen);
    assert.equal(
      requests[0]?.url,
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    );
    assert.equal(requests[0]?.body.model, "ep-20260514111437-7crsm");
    assert.equal("response_format" in (requests[0]?.body ?? {}), false);
  });

  it("allows explicitly enabling JSON object format for compatible chat models", async () => {
    process.env.AI_PROVIDER = "ark";
    process.env.AI_MODEL = "ep-test";
    process.env.AI_CHAT_RESPONSE_FORMAT = "json_object";
    const requests: CapturedRequest[] = [];
    mockFetch(requests, {
      choices: [
        {
          message: {
            content: JSON.stringify(makeModelOutput())
          }
        }
      ]
    });

    await new OpenAiProvider().generate(makeInput());

    assert.deepEqual(requests[0]?.body.response_format, { type: "json_object" });
  });

  it("keeps compatibility with legacy AI_PROVIDER_BASE_URL", async () => {
    process.env.AI_PROVIDER = "ark";
    process.env.AI_PROVIDER_BASE_URL = "https://example.test/api/v3/";
    process.env.AI_MODEL = "ep-test";
    const requests: CapturedRequest[] = [];
    mockFetch(requests, {
      choices: [
        {
          message: {
            content: JSON.stringify(makeModelOutput())
          }
        }
      ]
    });

    await new OpenAiProvider().generate(makeInput());

    assert.equal(requests[0]?.url, "https://example.test/api/v3/chat/completions");
  });
});

interface CapturedRequest {
  url: string;
  body: Record<string, any>;
}

function mockFetch(requests: CapturedRequest[], responseBody: unknown): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, any>
    });

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

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

function makeModelOutput() {
  return {
    targetAudience: ["茶文化爱好者"],
    sellingPointTags: ["一壶四杯"],
    suggestedStartPriceFen: 0,
    suggestedDealMinFen: 59900,
    suggestedDealMaxFen: 71900,
    suggestedCapPriceFen: 89900,
    cautionPriceFen: 89900,
    priceReasoning: "价格仅作为直播竞拍参考，不作为专业鉴定。",
    liveScript: "适合日常泡茶和送礼，按预算理性参与。",
    atmosphereCopy: "当前价格可参考区间判断。",
    riskNotes: ["价格仅供参考，请理性出价"],
    confidence: "medium"
  };
}
