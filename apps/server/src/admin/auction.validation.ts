import { AuctionStatus } from "@live-auction/shared";
import {
  type AuctionRulePayload,
  type AuctionRuleValues,
  parseCreateAuctionRule
} from "../auction/auction-rule.validation";
import { validationFailed } from "../common/api-error";
import {
  type ItemPayload,
  type ItemValues,
  parseCreateItem,
  readRequiredString
} from "./item.validation";

export interface CreateAuctionPayload extends AuctionRulePayload {
  roomId?: unknown;
  itemId?: unknown;
}

export interface CreateAuctionWithItemPayload extends AuctionRulePayload {
  roomId?: unknown;
  item?: unknown;
}

export interface CreateAuctionValues {
  roomId: string;
  itemId: string;
  rule: AuctionRuleValues;
}

export interface CreateAuctionWithItemValues {
  roomId: string;
  item: ItemValues;
  rule: AuctionRuleValues;
}

export interface CancelAuctionPayload {
  reason?: unknown;
}

export function parseCreateAuction(payload: CreateAuctionPayload): CreateAuctionValues {
  return {
    roomId: readRequiredString(payload.roomId, "roomId", 191),
    itemId: readRequiredString(payload.itemId, "itemId", 191),
    rule: parseCreateAuctionRule(payload)
  };
}

export function parseCreateAuctionWithItem(
  payload: CreateAuctionWithItemPayload
): CreateAuctionWithItemValues {
  if (typeof payload.item !== "object" || payload.item === null || Array.isArray(payload.item)) {
    throw validationFailed("item", "must be an object");
  }

  return {
    roomId: readRequiredString(payload.roomId, "roomId", 191),
    item: parseCreateItem(payload.item as ItemPayload),
    rule: parseCreateAuctionRule(payload)
  };
}

export function parseCancelAuction(payload: CancelAuctionPayload): string {
  return readRequiredString(payload.reason, "reason", 200);
}

export function parseAuctionStatusFilter(value: unknown): AuctionStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) || typeof value !== "string") {
    throw validationFailed("status", "must be an AuctionStatus string");
  }

  const normalized = value.trim();
  if (!Object.values(AuctionStatus).includes(normalized as AuctionStatus)) {
    throw validationFailed("status", "must be a valid AuctionStatus");
  }

  return normalized as AuctionStatus;
}
