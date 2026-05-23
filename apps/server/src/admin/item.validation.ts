import { validationFailed } from "../common/api-error";

export interface ItemPayload {
  name?: unknown;
  imageUrl?: unknown;
  description?: unknown;
  sellingPoints?: unknown;
}

export interface ItemValues {
  name: string;
  imageUrl: string;
  description: string;
  sellingPoints: string[];
}

export type ItemPatch = Partial<ItemValues>;

export function parseCreateItem(payload: ItemPayload): ItemValues {
  return {
    name: readRequiredString(payload.name, "name", 80),
    imageUrl: readRequiredUrl(payload.imageUrl, "imageUrl"),
    description: readRequiredString(payload.description, "description", 2000),
    sellingPoints: readSellingPoints(payload.sellingPoints)
  };
}

export function parsePatchItem(payload: ItemPayload): ItemPatch {
  const patch: ItemPatch = {};

  if (payload.name !== undefined) {
    patch.name = readRequiredString(payload.name, "name", 80);
  }

  if (payload.imageUrl !== undefined) {
    patch.imageUrl = readRequiredUrl(payload.imageUrl, "imageUrl");
  }

  if (payload.description !== undefined) {
    patch.description = readRequiredString(payload.description, "description", 2000);
  }

  if (payload.sellingPoints !== undefined) {
    patch.sellingPoints = readSellingPoints(payload.sellingPoints);
  }

  if (Object.keys(patch).length === 0) {
    throw validationFailed("item", "at least one item field is required");
  }

  return patch;
}

export function readRequiredString(value: unknown, field: string, maxLength: number): string {
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

function readRequiredUrl(value: unknown, field: string): string {
  const normalized = readRequiredString(value, field, 500);

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    throw validationFailed(field, "must be a valid http or https URL");
  }

  return normalized;
}

function readSellingPoints(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw validationFailed("sellingPoints", "must be an array");
  }

  if (value.length > 10) {
    throw validationFailed("sellingPoints", "must contain at most 10 items");
  }

  return value.map((point, index) => {
    if (typeof point !== "string") {
      throw validationFailed("sellingPoints", "each item must be a string", { index });
    }

    const normalized = point.trim();
    if (normalized.length === 0 || normalized.length > 30) {
      throw validationFailed("sellingPoints", "each item length must be between 1 and 30", {
        index
      });
    }

    return normalized;
  });
}
