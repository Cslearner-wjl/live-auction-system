import { Inject, Injectable } from "@nestjs/common";
import {
  type AuctionRule,
  type AuctionSession
} from "@prisma/client";
import {
  AuctionErrorCode,
  AuctionStatus
} from "@live-auction/shared";
import {
  RedisService,
  type RedisEvalResult
} from "../cache/redis.service";

export interface AtomicBidInput {
  auction: AuctionSession & { rule: AuctionRule };
  userId: string;
  amountFen: number;
  clientBidId: string;
  now: Date;
}

export interface AtomicBidAccepted {
  accepted: true;
  auctionId: string;
  amountFen: number;
  previousPriceFen: number;
  currentPriceFen: number;
  previousHighestBidderId: string | null;
  highestBidderId: string;
  bidCount: number;
  serverSeq: number;
  extended: boolean;
  newEndTimeMs: number;
  newExtendedCount: number;
  reachedCapPrice: boolean;
}

export interface AtomicBidRejected {
  accepted: false;
  auctionId: string;
  code: AuctionErrorCode;
  message: string;
  currentPriceFen?: number;
  highestBidderId?: string | null;
  endTimeMs?: number;
}

export type AtomicBidResult = AtomicBidAccepted | AtomicBidRejected;

export function auctionBidRedisKeys(auctionId: string, clientBidId: string) {
  const prefix = `auction:${auctionId}`;

  return {
    stateKey: `${prefix}:state`,
    currentPriceKey: `${prefix}:current_price_fen`,
    highestBidderKey: `${prefix}:highest_bidder_id`,
    endTimeKey: `${prefix}:end_time_ms`,
    bidCountKey: `${prefix}:bid_count`,
    leaderboardKey: `${prefix}:leaderboard`,
    clientBidKey: `${prefix}:client_bid:${clientBidId}`
  };
}

@Injectable()
export class RedisBidAtomicStore {
  private readonly hotKeyTtlSeconds = 24 * 60 * 60;

  constructor(
    @Inject(RedisService)
    private readonly redis: RedisService
  ) {}

  async placeBid(input: AtomicBidInput): Promise<AtomicBidResult> {
    const keys = auctionBidRedisKeys(input.auction.id, input.clientBidId);
    const result = await this.redis.eval(PLACE_BID_SCRIPT, {
      keys: [
        keys.stateKey,
        keys.currentPriceKey,
        keys.highestBidderKey,
        keys.endTimeKey,
        keys.bidCountKey,
        keys.leaderboardKey,
        keys.clientBidKey
      ],
      arguments: [
        input.auction.id,
        input.userId,
        String(input.amountFen),
        input.clientBidId,
        String(input.now.getTime()),
        input.auction.status,
        String(input.auction.currentPriceFen),
        input.auction.highestBidderId ?? "",
        String(input.auction.endTime?.getTime() ?? 0),
        String(input.auction.bidCount),
        String(input.auction.incrementFen),
        String(input.auction.capPriceFen),
        String(input.auction.rule.antiSnipingWindowSeconds),
        String(input.auction.rule.extensionSeconds),
        String(input.auction.rule.maxExtensionCount),
        String(input.auction.extendedCount),
        String(input.auction.serverSeq),
        String(this.hotKeyTtlSeconds)
      ]
    });

    return parseRedisScriptResult(result);
  }
}

function parseRedisScriptResult(result: RedisEvalResult): AtomicBidResult {
  if (typeof result !== "string") {
    throw new Error("Unexpected Redis bid script result");
  }

  const payload = JSON.parse(result) as Record<string, unknown>;
  const accepted = payload.accepted === true;

  if (!accepted) {
    return {
      accepted: false,
      auctionId: readString(payload.auctionId),
      code: toAuctionErrorCode(readString(payload.code)),
      message: readString(payload.message),
      currentPriceFen: readOptionalNumber(payload.currentPriceFen),
      highestBidderId: readOptionalNullableString(payload.highestBidderId),
      endTimeMs: readOptionalNumber(payload.endTimeMs)
    };
  }

  return {
    accepted: true,
    auctionId: readString(payload.auctionId),
    amountFen: readNumber(payload.amountFen),
    previousPriceFen: readNumber(payload.previousPriceFen),
    currentPriceFen: readNumber(payload.currentPriceFen),
    previousHighestBidderId: readOptionalNullableString(payload.previousHighestBidderId) ?? null,
    highestBidderId: readString(payload.highestBidderId),
    bidCount: readNumber(payload.bidCount),
    serverSeq: readNumber(payload.serverSeq),
    extended: payload.extended === true,
    newEndTimeMs: readNumber(payload.newEndTimeMs),
    newExtendedCount: readNumber(payload.newExtendedCount),
    reachedCapPrice: payload.reachedCapPrice === true
  };
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Redis bid script returned an invalid string field");
  }

  return value;
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Redis bid script returned an invalid number field");
  }

  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null ? undefined : readNumber(value);
}

function readOptionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  return readString(value);
}

function toAuctionErrorCode(code: string): AuctionErrorCode {
  if (Object.values(AuctionErrorCode).includes(code as AuctionErrorCode)) {
    return code as AuctionErrorCode;
  }

  return AuctionErrorCode.ValidationFailed;
}

const PLACE_BID_SCRIPT = `
local stateKey = KEYS[1]
local currentPriceKey = KEYS[2]
local highestBidderKey = KEYS[3]
local endTimeKey = KEYS[4]
local bidCountKey = KEYS[5]
local leaderboardKey = KEYS[6]
local clientBidKey = KEYS[7]

local auctionId = ARGV[1]
local userId = ARGV[2]
local amountFen = tonumber(ARGV[3])
local clientBidId = ARGV[4]
local nowMs = tonumber(ARGV[5])
local dbStatus = ARGV[6]
local dbCurrentPriceFen = tonumber(ARGV[7])
local dbHighestBidderId = ARGV[8]
local dbEndTimeMs = tonumber(ARGV[9])
local dbBidCount = tonumber(ARGV[10])
local incrementFen = tonumber(ARGV[11])
local capPriceFen = tonumber(ARGV[12])
local antiSnipingWindowSeconds = tonumber(ARGV[13])
local extensionSeconds = tonumber(ARGV[14])
local maxExtensionCount = tonumber(ARGV[15])
local dbExtendedCount = tonumber(ARGV[16])
local dbServerSeq = tonumber(ARGV[17])
local ttlSeconds = tonumber(ARGV[18])

local function expireKey(key)
  if ttlSeconds and ttlSeconds > 0 then
    redis.call("EXPIRE", key, ttlSeconds)
  end
end

local function reject(code, message, currentPriceFen, highestBidderId, endTimeMs)
  return cjson.encode({
    accepted = false,
    auctionId = auctionId,
    code = code,
    message = message,
    currentPriceFen = currentPriceFen,
    highestBidderId = highestBidderId,
    endTimeMs = endTimeMs
  })
end

if redis.call("EXISTS", clientBidKey) == 1 then
  return reject("DUPLICATE_CLIENT_BID", "clientBidId has already been accepted", nil, nil, nil)
end

local status = redis.call("HGET", stateKey, "status")
if not status then
  status = dbStatus
  redis.call("HSET", stateKey, "status", status, "server_seq", tostring(dbServerSeq), "extended_count", tostring(dbExtendedCount))
  redis.call("SET", currentPriceKey, tostring(dbCurrentPriceFen))
  redis.call("SET", endTimeKey, tostring(dbEndTimeMs))
  redis.call("SET", bidCountKey, tostring(dbBidCount))
  if dbHighestBidderId and dbHighestBidderId ~= "" then
    redis.call("SET", highestBidderKey, dbHighestBidderId)
  else
    redis.call("DEL", highestBidderKey)
  end
end

local currentPriceFen = tonumber(redis.call("GET", currentPriceKey) or dbCurrentPriceFen)
local highestBidderId = redis.call("GET", highestBidderKey) or ""
local endTimeMs = tonumber(redis.call("GET", endTimeKey) or dbEndTimeMs)
local bidCount = tonumber(redis.call("GET", bidCountKey) or dbBidCount)
local extendedCount = tonumber(redis.call("HGET", stateKey, "extended_count") or dbExtendedCount)

if dbStatus ~= "RUNNING" then
  redis.call("HSET", stateKey, "status", dbStatus)
  status = dbStatus
end

if status == "CANCELLED" then
  return reject("AUCTION_CANCELLED", "auction has been cancelled", currentPriceFen, highestBidderId, endTimeMs)
end

if status == "ENDED_SOLD" or status == "ENDED_UNSOLD" then
  return reject("AUCTION_ALREADY_ENDED", "auction has already ended", currentPriceFen, highestBidderId, endTimeMs)
end

if status ~= "RUNNING" then
  return reject("AUCTION_NOT_RUNNING", "auction is not running", currentPriceFen, highestBidderId, endTimeMs)
end

if nowMs > endTimeMs then
  return reject("AUCTION_ALREADY_ENDED", "auction has passed endTime", currentPriceFen, highestBidderId, endTimeMs)
end

if highestBidderId == userId then
  return reject("BIDDER_ALREADY_LEADING", "bidder is already leading", currentPriceFen, highestBidderId, endTimeMs)
end

if amountFen <= currentPriceFen then
  return reject("BID_AMOUNT_TOO_LOW", "bid amount must be greater than current price", currentPriceFen, highestBidderId, endTimeMs)
end

if ((amountFen - currentPriceFen) % incrementFen) ~= 0 then
  return reject("BID_INCREMENT_INVALID", "bid amount must follow incrementFen", currentPriceFen, highestBidderId, endTimeMs)
end

if amountFen > capPriceFen then
  return reject("BID_EXCEEDS_CAP_PRICE", "bid amount must not exceed capPriceFen", currentPriceFen, highestBidderId, endTimeMs)
end

local serverSeq = tonumber(redis.call("HINCRBY", stateKey, "server_seq", 1))
bidCount = tonumber(redis.call("INCR", bidCountKey))

local previousPriceFen = currentPriceFen
local previousHighestBidderId = highestBidderId
local reachedCapPrice = amountFen >= capPriceFen
local extended = false
local newEndTimeMs = endTimeMs

redis.call("SET", currentPriceKey, tostring(amountFen))
redis.call("SET", highestBidderKey, userId)
redis.call("ZADD", leaderboardKey, amountFen, userId)

if (not reachedCapPrice) and antiSnipingWindowSeconds > 0 and extensionSeconds > 0 and maxExtensionCount > 0 then
  local remainingMs = endTimeMs - nowMs
  if remainingMs <= antiSnipingWindowSeconds * 1000 and extendedCount < maxExtensionCount then
    extended = true
    extendedCount = extendedCount + 1
    newEndTimeMs = endTimeMs + extensionSeconds * 1000
    redis.call("SET", endTimeKey, tostring(newEndTimeMs))
    redis.call("HSET", stateKey, "extended_count", tostring(extendedCount))
  end
end

if reachedCapPrice then
  redis.call("HSET", stateKey, "status", "ENDED_SOLD")
end

redis.call("SET", clientBidKey, cjson.encode({
  auctionId = auctionId,
  clientBidId = clientBidId,
  userId = userId,
  amountFen = amountFen,
  serverSeq = serverSeq
}))

expireKey(stateKey)
expireKey(currentPriceKey)
expireKey(highestBidderKey)
expireKey(endTimeKey)
expireKey(bidCountKey)
expireKey(leaderboardKey)
expireKey(clientBidKey)

return cjson.encode({
  accepted = true,
  auctionId = auctionId,
  amountFen = amountFen,
  previousPriceFen = previousPriceFen,
  currentPriceFen = amountFen,
  previousHighestBidderId = previousHighestBidderId,
  highestBidderId = userId,
  bidCount = bidCount,
  serverSeq = serverSeq,
  extended = extended,
  newEndTimeMs = newEndTimeMs,
  newExtendedCount = extendedCount,
  reachedCapPrice = reachedCapPrice
})
`;
