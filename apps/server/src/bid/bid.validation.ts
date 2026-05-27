import { validationFailed } from "../common/api-error";

export interface PlaceBidPayload {
  amountFen?: unknown;
  clientBidId?: unknown;
}

export interface PlaceBidValues {
  amountFen: number;
  clientBidId: string;
}

export function parsePlaceBid(payload: PlaceBidPayload): PlaceBidValues {
  return {
    amountFen: readRequiredNonNegativeInteger(payload.amountFen, "amountFen"),
    clientBidId: readRequiredString(payload.clientBidId, "clientBidId", 191)
  };
}

function readRequiredNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw validationFailed(field, "must be an integer");
  }

  if (value < 0) {
    throw validationFailed(field, "must be greater than or equal to 0");
  }

  return value;
}

function readRequiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw validationFailed(field, "must be a string");
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw validationFailed(field, "must not be empty");
  }

  if (normalized.length > maxLength) {
    throw validationFailed(field, `must be at most ${maxLength} characters`);
  }

  return normalized;
}
