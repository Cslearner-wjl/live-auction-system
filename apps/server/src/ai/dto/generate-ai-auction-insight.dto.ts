import {
  type AuctionRulePayload,
  parseCreateAuctionRule
} from "../../auction/auction-rule.validation";
import { validationFailed } from "../../common/api-error";
import { readRequiredString } from "../../admin/item.validation";
import type {
  GenerateAiAuctionInsightValues,
  OptionalMarketInfoValues
} from "./ai-auction-insight.response";

export interface GenerateAiAuctionInsightPayload {
  itemName?: unknown;
  description?: unknown;
  sellingPoints?: unknown;
  roomId?: unknown;
  auctionRule?: unknown;
  optionalMarketInfo?: unknown;
}

export function parseGenerateAiAuctionInsight(
  payload: GenerateAiAuctionInsightPayload
): GenerateAiAuctionInsightValues {
  if (
    typeof payload.auctionRule !== "object" ||
    payload.auctionRule === null ||
    Array.isArray(payload.auctionRule)
  ) {
    throw validationFailed("auctionRule", "must be an object");
  }

  return {
    itemName: readRequiredString(payload.itemName, "itemName", 80),
    description: readRequiredString(payload.description, "description", 2000),
    sellingPoints: readStringArray(payload.sellingPoints, "sellingPoints", 10, 30),
    roomId:
      payload.roomId === undefined
        ? undefined
        : readRequiredString(payload.roomId, "roomId", 191),
    auctionRule: parseCreateAuctionRule(payload.auctionRule as AuctionRulePayload),
    optionalMarketInfo: parseOptionalMarketInfo(payload.optionalMarketInfo)
  };
}

function parseOptionalMarketInfo(value: unknown): OptionalMarketInfoValues | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationFailed("optionalMarketInfo", "must be an object");
  }

  const input = value as Record<string, unknown>;
  const marketInfo: OptionalMarketInfoValues = {};

  if (input.costPriceFen !== undefined) {
    marketInfo.costPriceFen = readNonNegativeInteger(input.costPriceFen, "costPriceFen");
  }

  if (input.referenceMarketPriceFen !== undefined) {
    marketInfo.referenceMarketPriceFen = readNonNegativeInteger(
      input.referenceMarketPriceFen,
      "referenceMarketPriceFen"
    );
  }

  if (input.condition !== undefined) {
    marketInfo.condition = readRequiredString(input.condition, "condition", 80);
  }

  if (input.brandOrOrigin !== undefined) {
    marketInfo.brandOrOrigin = readRequiredString(input.brandOrOrigin, "brandOrOrigin", 120);
  }

  if (input.targetAudienceHint !== undefined) {
    marketInfo.targetAudienceHint = readRequiredString(
      input.targetAudienceHint,
      "targetAudienceHint",
      120
    );
  }

  return marketInfo;
}

function readStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number
): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw validationFailed(field, "must be an array");
  }

  if (value.length > maxItems) {
    throw validationFailed(field, `must contain at most ${maxItems} items`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw validationFailed(field, "each item must be a string", { index });
    }

    const normalized = item.trim();
    if (normalized.length === 0 || normalized.length > maxLength) {
      throw validationFailed(field, `each item length must be between 1 and ${maxLength}`, {
        index
      });
    }

    return normalized;
  });
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw validationFailed(field, "must be a non-negative integer");
  }

  return value;
}
