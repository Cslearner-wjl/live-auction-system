import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { AuctionErrorCode } from "@live-auction/shared";
import type { AiAuctionInsight, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException, notFound } from "../common/api-error";
import type { AuctionRuleValues } from "../auction/auction-rule.validation";
import type { ItemValues } from "../admin/item.validation";
import {
  parseEditableAiAuctionInsight,
  toPublicAiAuctionInsight
} from "./ai-output.schema";
import { MockAiProvider } from "./mock-ai-provider";
import { OpenAiProvider } from "./openai-ai-provider";
import { PriceInferenceService } from "./price-inference.service";
import {
  parseGenerateAiAuctionInsight,
  type GenerateAiAuctionInsightPayload
} from "./dto/generate-ai-auction-insight.dto";
import type {
  AdminAiAuctionInsightResponse,
  AiAuctionInsightCore,
  AiInsightSource,
  GenerateAiAuctionInsightValues,
  PriceInferenceResult,
  PublicAiAuctionInsightResponse
} from "./dto/ai-auction-insight.response";

const ACTION_SUCCEEDED = "AI_GENERATION_SUCCEEDED";
const ACTION_FALLBACK = "AI_GENERATION_FALLBACK";
const ACTION_FAILED = "AI_GENERATION_FAILED";

interface AiInsightWriter {
  aiAuctionInsight: {
    create(args: { data: Prisma.AiAuctionInsightUncheckedCreateInput }): Promise<AiAuctionInsight>;
    update(args: {
      where: { id: string };
      data: Prisma.AiAuctionInsightUncheckedUpdateInput;
    }): Promise<AiAuctionInsight>;
  };
}

export interface BindAiInsightContext {
  itemId: string;
  auctionId: string;
  roomId: string;
  createdById?: string;
  item: ItemValues;
  rule: AuctionRuleValues;
}

@Injectable()
export class AiAuctionInsightService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PriceInferenceService)
    private readonly priceInference: PriceInferenceService,
    @Inject(MockAiProvider)
    private readonly mockProvider: MockAiProvider,
    @Inject(OpenAiProvider)
    private readonly openAiProvider: OpenAiProvider
  ) {}

  async generateInsight(
    payload: GenerateAiAuctionInsightPayload,
    actorUserId?: string
  ): Promise<AdminAiAuctionInsightResponse> {
    const values = parseGenerateAiAuctionInsight(payload);
    const priceRange = this.priceInference.infer(values);
    const input = {
      ...values,
      priceRange
    };
    const providerMode = readProviderMode();

    try {
      const generation = await this.generateWithConfiguredProvider(input, providerMode);
      const record = await this.prisma.aiAuctionInsight.create({
        data: toInsightPersistenceData(generation.output, {
          createdById: actorUserId,
          inputSnapshot: toInputSnapshot(values, priceRange)
        })
      });

      await this.writeAuditLog({
        action: generation.action,
        actorUserId,
        roomId: values.roomId,
        metadata: {
          providerMode,
          source: generation.output.source,
          fallbackReason: generation.fallbackReason,
          itemNameLength: values.itemName.length,
          sellingPointCount: values.sellingPoints.length
        }
      });

      return toAdminAiAuctionInsightResponse(record);
    } catch (error: unknown) {
      await this.writeAuditLog({
        action: ACTION_FAILED,
        actorUserId,
        roomId: values.roomId,
        metadata: {
          providerMode,
          errorName: error instanceof Error ? error.name : "UnknownError"
        }
      });

      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        AuctionErrorCode.ValidationFailed,
        "AI 竞拍参考生成失败",
        {
          reason: sanitizeErrorReason(error)
        }
      );
    }
  }

  async bindInsightToAuction(
    tx: AiInsightWriter,
    payload: unknown,
    context: BindAiInsightContext
  ): Promise<void> {
    const insight = parseEditableAiAuctionInsight(payload);
    const data = toInsightPersistenceData(insight, {
      itemId: context.itemId,
      auctionId: context.auctionId,
      createdById: context.createdById,
      inputSnapshot: {
        item: { ...context.item },
        auctionRule: { ...context.rule },
        boundFromAdminForm: true,
        originalInsightId: insight.id ?? null
      }
    });

    if (insight.id) {
      try {
        await tx.aiAuctionInsight.update({
          where: { id: insight.id },
          data
        });
        return;
      } catch {
        // If the draft row was not found, preserve the edited output by creating a bound row.
      }
    }

    await tx.aiAuctionInsight.create({ data });
  }

  async getPublicInsight(auctionId: string): Promise<PublicAiAuctionInsightResponse> {
    const record = await this.prisma.aiAuctionInsight.findFirst({
      where: { auctionId },
      orderBy: { createdAt: "desc" }
    });

    if (!record) {
      throw notFound(AuctionErrorCode.AiInsightNotFound, "AI 竞拍参考不存在", { auctionId });
    }

    return toPublicAiAuctionInsight(toCore(record));
  }

  private async generateWithConfiguredProvider(
    input: Parameters<OpenAiProvider["generate"]>[0],
    providerMode: "mock" | "openai" | "ark"
  ): Promise<{
    output: AiAuctionInsightCore;
    action: string;
    fallbackReason?: string;
  }> {
    if (providerMode === "mock") {
      return {
        output: await this.mockProvider.generate(input),
        action: ACTION_SUCCEEDED
      };
    }

    if (!this.openAiProvider.isConfigured()) {
      const fallback = await this.mockProvider.generate(input);
      return {
        output: { ...fallback, source: "fallback" },
        action: ACTION_FALLBACK,
        fallbackReason: "missing_api_key"
      };
    }

    try {
      return {
        output: await this.openAiProvider.generate(input),
        action: ACTION_SUCCEEDED
      };
    } catch (error: unknown) {
      const fallback = await this.mockProvider.generate(input);
      return {
        output: { ...fallback, source: "fallback" },
        action: ACTION_FALLBACK,
        fallbackReason: sanitizeErrorReason(error)
      };
    }
  }

  private async writeAuditLog(input: {
    action: string;
    actorUserId?: string;
    roomId?: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        roomId: input.roomId,
        action: input.action,
        metadata: toJsonObject(input.metadata)
      }
    });
  }
}

function toInsightPersistenceData(
  insight: AiAuctionInsightCore,
  context: {
    itemId?: string;
    auctionId?: string;
    createdById?: string;
    inputSnapshot: Prisma.InputJsonObject;
  }
): Prisma.AiAuctionInsightUncheckedCreateInput {
  return {
    itemId: context.itemId,
    auctionId: context.auctionId,
    createdById: context.createdById,
    source: insight.source,
    targetAudience: insight.targetAudience,
    sellingPointTags: insight.sellingPointTags,
    liveScript: insight.liveScript,
    atmosphereCopy: insight.atmosphereCopy,
    suggestedStartPriceFen: insight.suggestedStartPriceFen,
    suggestedDealMinFen: insight.suggestedDealMinFen,
    suggestedDealMaxFen: insight.suggestedDealMaxFen,
    suggestedCapPriceFen: insight.suggestedCapPriceFen,
    cautionPriceFen: insight.cautionPriceFen,
    priceReasoning: insight.priceReasoning,
    riskNotes: insight.riskNotes,
    confidence: insight.confidence,
    inputSnapshot: context.inputSnapshot
  };
}

function toAdminAiAuctionInsightResponse(
  record: AiAuctionInsight
): AdminAiAuctionInsightResponse {
  return {
    id: record.id,
    itemId: record.itemId,
    auctionId: record.auctionId,
    ...toCore(record),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toCore(record: AiAuctionInsight): AiAuctionInsightCore {
  return {
    source: readSource(record.source),
    targetAudience: toStringArray(record.targetAudience),
    sellingPointTags: toStringArray(record.sellingPointTags),
    liveScript: record.liveScript,
    atmosphereCopy: record.atmosphereCopy,
    suggestedStartPriceFen: record.suggestedStartPriceFen ?? 0,
    suggestedDealMinFen: record.suggestedDealMinFen ?? 0,
    suggestedDealMaxFen: record.suggestedDealMaxFen ?? 0,
    suggestedCapPriceFen: record.suggestedCapPriceFen ?? 0,
    cautionPriceFen: record.cautionPriceFen ?? 0,
    priceReasoning: record.priceReasoning,
    riskNotes: toStringArray(record.riskNotes),
    confidence:
      record.confidence === "low" || record.confidence === "high"
        ? record.confidence
        : "medium"
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readSource(value: string): AiInsightSource {
  if (value === "openai" || value === "ark" || value === "fallback") {
    return value;
  }

  return "mock";
}

function readProviderMode(): "mock" | "openai" | "ark" {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  return provider === "openai" || provider === "ark" ? provider : "mock";
}

function toInputSnapshot(
  values: GenerateAiAuctionInsightValues,
  priceRange: PriceInferenceResult
): Prisma.InputJsonObject {
  return {
    itemName: values.itemName,
    descriptionLength: values.description.length,
    sellingPoints: values.sellingPoints,
    roomId: values.roomId ?? null,
    auctionRule: { ...values.auctionRule },
    optionalMarketInfo: values.optionalMarketInfo ? { ...values.optionalMarketInfo } : null,
    priceRange: { ...priceRange }
  };
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }

    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null
    ) {
      result[key] = entry;
    }
  }

  return result;
}

function sanitizeErrorReason(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown_error";
  }

  return error.name || "error";
}
