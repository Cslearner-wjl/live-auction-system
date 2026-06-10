import { validationFailed } from "../common/api-error";
import type {
  AiAuctionInsightCore,
  AiInsightConfidence,
  AiInsightSource,
  PublicAiAuctionInsightResponse
} from "./dto/ai-auction-insight.response";

export class AiOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputValidationError";
  }
}

export interface EditableAiAuctionInsightPayload {
  id?: unknown;
  source?: unknown;
  targetAudience?: unknown;
  sellingPointTags?: unknown;
  suggestedStartPriceFen?: unknown;
  suggestedDealMinFen?: unknown;
  suggestedDealMaxFen?: unknown;
  suggestedCapPriceFen?: unknown;
  cautionPriceFen?: unknown;
  priceReasoning?: unknown;
  liveScript?: unknown;
  atmosphereCopy?: unknown;
  riskNotes?: unknown;
  confidence?: unknown;
}

export interface EditableAiAuctionInsight extends AiAuctionInsightCore {
  id?: string;
}

export const OPENAI_AI_AUCTION_INSIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "targetAudience",
    "sellingPointTags",
    "suggestedStartPriceFen",
    "suggestedDealMinFen",
    "suggestedDealMaxFen",
    "suggestedCapPriceFen",
    "cautionPriceFen",
    "priceReasoning",
    "liveScript",
    "atmosphereCopy",
    "riskNotes",
    "confidence"
  ],
  properties: {
    targetAudience: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" }
    },
    sellingPointTags: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" }
    },
    suggestedStartPriceFen: { type: "integer", minimum: 0 },
    suggestedDealMinFen: { type: "integer", minimum: 0 },
    suggestedDealMaxFen: { type: "integer", minimum: 0 },
    suggestedCapPriceFen: { type: "integer", minimum: 0 },
    cautionPriceFen: { type: "integer", minimum: 0 },
    priceReasoning: { type: "string" },
    liveScript: { type: "string" },
    atmosphereCopy: { type: "string" },
    riskNotes: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" }
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] }
  }
} as const;

export function normalizeAiAuctionInsightOutput(
  value: unknown,
  source: AiInsightSource
): AiAuctionInsightCore {
  const input = readObject(value, "root");
  const output: AiAuctionInsightCore = {
    source,
    targetAudience: readStringArray(input.targetAudience, "targetAudience", 1, 6, 60),
    sellingPointTags: readStringArray(input.sellingPointTags, "sellingPointTags", 1, 8, 40),
    suggestedStartPriceFen: readNonNegativeInteger(
      input.suggestedStartPriceFen,
      "suggestedStartPriceFen"
    ),
    suggestedDealMinFen: readNonNegativeInteger(
      input.suggestedDealMinFen,
      "suggestedDealMinFen"
    ),
    suggestedDealMaxFen: readNonNegativeInteger(
      input.suggestedDealMaxFen,
      "suggestedDealMaxFen"
    ),
    suggestedCapPriceFen: readNonNegativeInteger(
      input.suggestedCapPriceFen,
      "suggestedCapPriceFen"
    ),
    cautionPriceFen: readNonNegativeInteger(input.cautionPriceFen, "cautionPriceFen"),
    priceReasoning: readRequiredString(input.priceReasoning, "priceReasoning", 1200),
    liveScript: readRequiredString(input.liveScript, "liveScript", 2000),
    atmosphereCopy: readRequiredString(input.atmosphereCopy, "atmosphereCopy", 1000),
    riskNotes: readStringArray(input.riskNotes, "riskNotes", 1, 6, 120),
    confidence: readConfidence(input.confidence)
  };

  assertPriceOrdering(output);
  assertRiskReminder(output.riskNotes);
  return output;
}

export function parseEditableAiAuctionInsight(
  value: unknown
): EditableAiAuctionInsight {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationFailed("aiInsight", "must be an object");
  }

  try {
    const input = value as EditableAiAuctionInsightPayload;
    const source = readSource(input.source);
    const normalized = normalizeAiAuctionInsightOutput(input, source);
    const id = input.id === undefined ? undefined : readId(input.id);
    return id ? { id, ...normalized } : normalized;
  } catch (error: unknown) {
    if (error instanceof AiOutputValidationError) {
      throw validationFailed("aiInsight", error.message);
    }

    throw error;
  }
}

export function toPublicAiAuctionInsight(
  insight: AiAuctionInsightCore
): PublicAiAuctionInsightResponse {
  return {
    source: insight.source,
    targetAudience: insight.targetAudience,
    suggestedDealMinFen: insight.suggestedDealMinFen,
    suggestedDealMaxFen: insight.suggestedDealMaxFen,
    cautionPriceFen: insight.cautionPriceFen,
    riskNotes: insight.riskNotes,
    confidence: insight.confidence
  };
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AiOutputValidationError(`${field} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readStringArray(
  value: unknown,
  field: string,
  minItems: number,
  maxItems: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value)) {
    throw new AiOutputValidationError(`${field} must be an array`);
  }

  if (value.length < minItems || value.length > maxItems) {
    throw new AiOutputValidationError(
      `${field} must contain between ${minItems} and ${maxItems} items`
    );
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new AiOutputValidationError(`${field}[${index}] must be a string`);
    }

    const normalized = item.trim();
    if (normalized.length === 0 || normalized.length > maxLength) {
      throw new AiOutputValidationError(
        `${field}[${index}] length must be between 1 and ${maxLength}`
      );
    }

    return normalized;
  });
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AiOutputValidationError(`${field} must be a non-negative integer`);
  }

  return value;
}

function readRequiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new AiOutputValidationError(`${field} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new AiOutputValidationError(`${field} length must be between 1 and ${maxLength}`);
  }

  return normalized;
}

function readConfidence(value: unknown): AiInsightConfidence {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new AiOutputValidationError("confidence must be low, medium, or high");
}

function readSource(value: unknown): AiInsightSource {
  if (value === "mock" || value === "openai" || value === "ark" || value === "fallback") {
    return value;
  }

  throw new AiOutputValidationError("source must be mock, openai, ark, or fallback");
}

function readId(value: unknown): string {
  if (typeof value !== "string") {
    throw new AiOutputValidationError("id must be a string");
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 191) {
    throw new AiOutputValidationError("id length must be between 1 and 191");
  }

  return normalized;
}

function assertPriceOrdering(output: AiAuctionInsightCore): void {
  if (output.suggestedDealMaxFen < output.suggestedDealMinFen) {
    throw new AiOutputValidationError(
      "suggestedDealMaxFen must be greater than or equal to suggestedDealMinFen"
    );
  }

  if (output.suggestedCapPriceFen < output.suggestedDealMaxFen) {
    throw new AiOutputValidationError(
      "suggestedCapPriceFen must be greater than or equal to suggestedDealMaxFen"
    );
  }

  if (output.cautionPriceFen < output.suggestedDealMaxFen) {
    throw new AiOutputValidationError(
      "cautionPriceFen must be greater than or equal to suggestedDealMaxFen"
    );
  }
}

function assertRiskReminder(riskNotes: string[]): void {
  if (
    !riskNotes.some(
      (note) =>
        note.includes("价格仅供参考") ||
        (note.includes("仅供参考") && note.includes("理性"))
    )
  ) {
    throw new AiOutputValidationError("riskNotes must include a reference-only reminder");
  }
}
