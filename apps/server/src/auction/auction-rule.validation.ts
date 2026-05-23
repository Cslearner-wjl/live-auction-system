import { HttpStatus } from "@nestjs/common";
import { AuctionErrorCode, AuctionStatus } from "@live-auction/shared";
import { ApiException, validationFailed } from "../common/api-error";

export interface AuctionRulePayload {
  startPriceFen?: unknown;
  incrementFen?: unknown;
  durationSeconds?: unknown;
  capPriceFen?: unknown;
  antiSnipingWindowSeconds?: unknown;
  extensionSeconds?: unknown;
  maxExtensionCount?: unknown;
}

export interface AuctionRuleValues {
  startPriceFen: number;
  incrementFen: number;
  durationSeconds: number;
  capPriceFen: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
}

export type AuctionRulePatch = Partial<AuctionRuleValues>;

const requiredRuleFields: readonly (keyof AuctionRuleValues)[] = [
  "startPriceFen",
  "incrementFen",
  "durationSeconds",
  "capPriceFen",
  "antiSnipingWindowSeconds",
  "extensionSeconds"
];

const optionalRuleFields: readonly (keyof AuctionRuleValues)[] = ["maxExtensionCount"];
const allRuleFields = [...requiredRuleFields, ...optionalRuleFields] as const;

export function parseCreateAuctionRule(payload: AuctionRulePayload): AuctionRuleValues {
  const values = {} as AuctionRuleValues;

  for (const field of requiredRuleFields) {
    values[field] = readRequiredInteger(payload[field], field);
  }

  values.maxExtensionCount =
    payload.maxExtensionCount === undefined
      ? 0
      : readRequiredInteger(payload.maxExtensionCount, "maxExtensionCount");

  validateRuleRange(values);
  return values;
}

export function parsePatchAuctionRule(
  payload: AuctionRulePayload,
  current: AuctionRuleValues
): AuctionRulePatch {
  const patch: AuctionRulePatch = {};

  for (const field of allRuleFields) {
    const value = payload[field];
    if (value !== undefined) {
      patch[field] = readRequiredInteger(value, field);
    }
  }

  if (Object.keys(patch).length === 0) {
    throw validationFailed("rules", "at least one rule field is required");
  }

  const merged: AuctionRuleValues = {
    ...current,
    ...patch
  };
  validateRuleRange(merged);

  return patch;
}

export function assertAuctionRuleEditable(
  status: AuctionStatus,
  auctionId: string
): void {
  if (status === AuctionStatus.Draft || status === AuctionStatus.Scheduled) {
    return;
  }

  throw new ApiException(
    HttpStatus.CONFLICT,
    AuctionErrorCode.RuleCannotBeChangedAfterStart,
    "竞拍开始后不能修改规则",
    {
      auctionId,
      status
    }
  );
}

function validateRuleRange(values: AuctionRuleValues): void {
  if (values.startPriceFen < 0) {
    throw validationFailed("startPriceFen", "must be greater than or equal to 0");
  }

  if (values.incrementFen <= 0) {
    throw validationFailed("incrementFen", "must be greater than 0");
  }

  if (values.durationSeconds <= 0) {
    throw validationFailed("durationSeconds", "must be greater than 0");
  }

  if (values.capPriceFen <= values.startPriceFen) {
    throw validationFailed("capPriceFen", "must be greater than startPriceFen", {
      startPriceFen: values.startPriceFen
    });
  }

  if (values.antiSnipingWindowSeconds < 0) {
    throw validationFailed("antiSnipingWindowSeconds", "must be greater than or equal to 0");
  }

  if (values.extensionSeconds < 0) {
    throw validationFailed("extensionSeconds", "must be greater than or equal to 0");
  }

  if (values.maxExtensionCount < 0) {
    throw validationFailed("maxExtensionCount", "must be greater than or equal to 0");
  }
}

function readRequiredInteger(value: unknown, field: string): number {
  if (value === undefined) {
    throw validationFailed(field, "is required");
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw validationFailed(field, "must be an integer");
  }

  return value;
}
