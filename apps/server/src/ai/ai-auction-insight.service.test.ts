import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AuctionErrorCode } from "@live-auction/shared";
import type { AiAuctionInsight } from "@prisma/client";
import { ApiException } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { AiAuctionInsightService } from "./ai-auction-insight.service";
import { MockAiProvider } from "./mock-ai-provider";
import { OpenAiProvider } from "./openai-ai-provider";
import { PriceInferenceService } from "./price-inference.service";
import type {
  AiAuctionInsightCore,
  AiProviderInput
} from "./dto/ai-auction-insight.response";

const originalEnv = { ...process.env };

describe("AiAuctionInsightService", () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = "mock";
    process.env.AI_API_KEY = "";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns source=mock when AI_PROVIDER=mock", async () => {
    const harness = makeHarness();

    const result = await harness.service.generateInsight(makePayload(), "admin_1");

    assert.equal(result.source, "mock");
    assert.equal(harness.prisma.auditLogs[0]?.action, "AI_GENERATION_SUCCEEDED");
  });

  it("falls back when AI_PROVIDER=openai but AI_API_KEY is missing", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "";
    const harness = makeHarness();

    const result = await harness.service.generateInsight(makePayload(), "admin_1");

    assert.equal(result.source, "fallback");
    assert.equal(harness.prisma.auditLogs[0]?.action, "AI_GENERATION_FALLBACK");
    assert.equal(harness.prisma.auditLogs[0]?.metadata.fallbackReason, "missing_api_key");
  });

  it("falls back and does not record API keys when OpenAiProvider throws", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "test-api-key";
    const harness = makeHarness({
      openAiProvider: {
        isConfigured: () => true,
        generate: async () => {
          throw new Error("network failed with test-api-key");
        }
      } as unknown as OpenAiProvider
    });

    const result = await harness.service.generateInsight(makePayload(), "admin_1");

    assert.equal(result.source, "fallback");
    assert.equal(harness.prisma.auditLogs[0]?.action, "AI_GENERATION_FALLBACK");
    assert.equal(JSON.stringify(harness.prisma.auditLogs).includes("test-api-key"), false);
  });

  it("writes success audit when OpenAiProvider succeeds", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "test-api-key";
    const harness = makeHarness({
      openAiProvider: {
        isConfigured: () => true,
        generate: async (input: AiProviderInput) => makeOpenAiOutput(input)
      } as unknown as OpenAiProvider
    });

    const result = await harness.service.generateInsight(makePayload(), "admin_1");

    assert.equal(result.source, "openai");
    assert.equal(harness.prisma.auditLogs[0]?.action, "AI_GENERATION_SUCCEEDED");
    assert.equal(JSON.stringify(harness.prisma.auditLogs).includes("test-api-key"), false);
  });

  it("supports Ark provider mode and records source=ark on success", async () => {
    process.env.AI_PROVIDER = "ark";
    process.env.AI_API_KEY = "test-api-key";
    const harness = makeHarness({
      openAiProvider: {
        isConfigured: () => true,
        generate: async (input: AiProviderInput) => ({
          ...makeOpenAiOutput(input),
          source: "ark"
        })
      } as unknown as OpenAiProvider
    });

    const result = await harness.service.generateInsight(makePayload(), "admin_1");

    assert.equal(result.source, "ark");
    assert.equal(harness.prisma.auditLogs[0]?.action, "AI_GENERATION_SUCCEEDED");
    assert.equal(harness.prisma.auditLogs[0]?.metadata.providerMode, "ark");
  });

  it("returns public insight without internal input snapshots", async () => {
    const harness = makeHarness();
    const generated = await harness.service.generateInsight(makePayload(), "admin_1");
    await harness.service.bindInsightToAuction(harness.prisma, generated, {
      itemId: "item_1",
      auctionId: "auction_1",
      roomId: "room_1",
      createdById: "admin_1",
      item: {
        name: "紫砂茶具套装",
        imageUrl: "https://example.com/item.png",
        description: "一壶四杯",
        sellingPoints: ["茶具"]
      },
      rule: makePayload().auctionRule as never
    });

    const publicInsight = await harness.service.getPublicInsight("auction_1");

    assert.deepEqual(Object.keys(publicInsight).sort(), [
      "cautionPriceFen",
      "confidence",
      "riskNotes",
      "source",
      "suggestedDealMaxFen",
      "suggestedDealMinFen",
      "targetAudience"
    ].sort());
  });

  it("throws AI_INSIGHT_NOT_FOUND when public insight does not exist", async () => {
    const harness = makeHarness();

    await assert.rejects(
      () => harness.service.getPublicInsight("missing_auction"),
      (error: unknown) => {
        assert.ok(error instanceof ApiException);
        const response = error.getResponse() as { code: AuctionErrorCode };
        assert.equal(response.code, AuctionErrorCode.AiInsightNotFound);
        return true;
      }
    );
  });
});

function makeHarness(overrides: { openAiProvider?: OpenAiProvider } = {}) {
  const prisma = new AiPrismaFake();
  const service = new AiAuctionInsightService(
    prisma as unknown as PrismaService,
    new PriceInferenceService(),
    new MockAiProvider(),
    overrides.openAiProvider ?? new OpenAiProvider()
  );

  return { prisma, service };
}

function makePayload() {
  return {
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
}

function makeOpenAiOutput(input: AiProviderInput): AiAuctionInsightCore {
  return {
    source: "openai",
    targetAudience: ["茶文化爱好者"],
    sellingPointTags: ["一壶四杯"],
    suggestedStartPriceFen: input.priceRange.suggestedStartPriceFen,
    suggestedDealMinFen: input.priceRange.suggestedDealMinFen,
    suggestedDealMaxFen: input.priceRange.suggestedDealMaxFen,
    suggestedCapPriceFen: input.priceRange.suggestedCapPriceFen,
    cautionPriceFen: input.priceRange.cautionPriceFen,
    priceReasoning: "价格仅作为直播竞拍参考，不作为专业鉴定。",
    liveScript: "适合日常泡茶和送礼，按预算理性参与。",
    atmosphereCopy: "当前价格可参考区间判断。",
    riskNotes: ["价格仅供参考，请理性出价"],
    confidence: "medium"
  };
}

class AiPrismaFake {
  readonly records: AiAuctionInsight[] = [];
  readonly auditLogs: Array<{ action: string; metadata: Record<string, unknown> }> = [];

  readonly aiAuctionInsight = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const record = {
        id: `insight_${this.records.length + 1}`,
        itemId: (data.itemId as string | undefined) ?? null,
        auctionId: (data.auctionId as string | undefined) ?? null,
        source: data.source as string,
        targetAudience: data.targetAudience,
        sellingPointTags: data.sellingPointTags,
        liveScript: data.liveScript as string,
        atmosphereCopy: data.atmosphereCopy as string,
        suggestedStartPriceFen: data.suggestedStartPriceFen as number,
        suggestedDealMinFen: data.suggestedDealMinFen as number,
        suggestedDealMaxFen: data.suggestedDealMaxFen as number,
        suggestedCapPriceFen: data.suggestedCapPriceFen as number,
        cautionPriceFen: data.cautionPriceFen as number,
        priceReasoning: data.priceReasoning as string,
        riskNotes: data.riskNotes,
        confidence: data.confidence as string,
        inputSnapshot: data.inputSnapshot,
        createdById: (data.createdById as string | undefined) ?? null,
        createdAt: now,
        updatedAt: now
      } as AiAuctionInsight;
      this.records.push(record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = this.records.findIndex((record) => record.id === where.id);
      if (index < 0) {
        throw new Error("record not found");
      }

      const current = this.records[index]!;
      const updated = {
        ...current,
        ...data,
        updatedAt: new Date()
      } as AiAuctionInsight;
      this.records[index] = updated;
      return updated;
    },
    findFirst: async ({ where }: { where: { auctionId?: string } }) =>
      [...this.records]
        .reverse()
        .find((record) => !where.auctionId || record.auctionId === where.auctionId) ?? null
  };

  readonly auditLog = {
    create: async ({ data }: { data: { action: string; metadata: Record<string, unknown> } }) => {
      this.auditLogs.push(data);
      return {
        id: `audit_${this.auditLogs.length}`,
        ...data,
        actorUserId: null,
        auctionId: null,
        roomId: null,
        clientBidId: null,
        eventId: null,
        createdAt: new Date()
      };
    }
  };
}
