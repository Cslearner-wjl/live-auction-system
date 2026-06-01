import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  LiveRoomStatus,
  PrismaClient,
  UserRole
} from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createClient } from "redis";

interface Config {
  apiBaseUrl: string;
  redisUrl: string;
  roomId: string;
  adminUserId: string;
  bidderPrefix: string;
  attempts: number;
  incrementFen: number;
  capPriceFen: number;
  durationSeconds: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
}

interface HttpResult<T> {
  status: number;
  ok: boolean;
  body: T;
  latencyMs: number;
}

interface BidResponse {
  accepted?: boolean;
  auctionId?: string;
  bidId?: string;
  amountFen?: number;
  currentPriceFen?: number;
  highestBidderId?: string | null;
  bidCount?: number;
  serverSeq?: number;
  status?: string;
  idempotent?: boolean;
  code?: string;
  message?: string;
}

interface AuctionDto {
  id: string;
  roomId: string;
  status: string;
  currentPriceFen: number;
  incrementFen: number;
  capPriceFen: number;
  highestBidderId: string | null;
  bidCount: number;
  endTime: string | null;
}

interface SnapshotDto {
  auctionId: string;
  status: string;
  currentPriceFen: number;
  highestBidderMaskedName: string | null;
  bidCount: number;
  participantCount: number;
  serverSeq: number;
}

interface OrderListDto {
  items: Array<{
    id: string;
    auctionId: string;
    amountFen: number;
  }>;
  page: {
    total: number;
  };
}

interface BidAttemptResult {
  userId: string;
  amountFen: number;
  clientBidId: string;
  httpStatus: number;
  accepted: boolean;
  code: string | null;
  message: string | null;
  bidId: string | null;
  serverSeq: number | null;
  latencyMs: number;
}

interface RedisAuctionState {
  currentPriceFen: number | null;
  highestBidderId: string | null;
  bidCount: number | null;
  endTimeMs: number | null;
  leaderboardSize: number;
}

const config = readConfig();

async function main(): Promise<void> {
  const runId = `day12-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const prisma = createPrismaClient();
  const redis = createClient({ url: config.redisUrl });

  try {
    await ensureDemoFixtures(prisma, config);
    await redis.connect();
    await requestJson<Record<string, unknown>>("/health", {
      method: "GET"
    });

    const item = await requestJson<{ id: string }>("/admin/items", {
      method: "POST",
      headers: adminHeaders(config),
      body: {
        name: `Day12 压测商品 ${runId}`,
        imageUrl: "https://example.com/day12-load.png",
        description: "Day12 HTTP concurrency baseline item.",
        sellingPoints: ["load-test", "redis-lua", "idempotent"]
      }
    });

    const scheduled = await requestJson<AuctionDto>("/admin/auctions", {
      method: "POST",
      headers: adminHeaders(config),
      body: {
        roomId: config.roomId,
        itemId: item.body.id,
        startPriceFen: 0,
        incrementFen: config.incrementFen,
        durationSeconds: config.durationSeconds,
        capPriceFen: config.capPriceFen,
        antiSnipingWindowSeconds: config.antiSnipingWindowSeconds,
        extensionSeconds: config.extensionSeconds,
        maxExtensionCount: config.maxExtensionCount
      }
    });

    const running = await requestJson<AuctionDto>(`/admin/auctions/${scheduled.body.id}/start`, {
      method: "POST",
      headers: adminHeaders(config)
    });

    const bidResults = await runBidAttempts(running.body.id, runId, config);
    const auction = await requestJson<AuctionDto>(`/admin/auctions/${running.body.id}`, {
      method: "GET",
      headers: adminHeaders(config)
    });
    const snapshot = await requestJson<SnapshotDto>(`/auctions/${running.body.id}/snapshot`, {
      method: "GET",
      headers: bidderHeaders(`${config.bidderPrefix}_1`)
    });
    const orders = await requestJson<OrderListDto>("/admin/orders?page=1&pageSize=100", {
      method: "GET",
      headers: adminHeaders(config)
    });
    const redisState = await readRedisAuctionState(redis, running.body.id);
    const verification = verifyConsistency({
      auction: auction.body,
      snapshot: snapshot.body,
      orders: orders.body,
      redisState,
      bidResults
    });

    await cleanupAuction(running.body.id);

    const report = buildReport({
      runId,
      auctionId: running.body.id,
      bidResults,
      auction: auction.body,
      snapshot: snapshot.body,
      redisState,
      verification
    });

    console.log(JSON.stringify(report, null, 2));

    if (!verification.ok) {
      process.exitCode = 1;
    }
  } finally {
    if (redis.isOpen) {
      await redis.quit();
    }
    await prisma.$disconnect();
  }
}

function readConfig(): Config {
  const attempts = readIntEnv("DAY12_BID_ATTEMPTS", 30);
  const incrementFen = readIntEnv("DAY12_INCREMENT_FEN", 1000);

  return {
    apiBaseUrl: readStringEnv("API_BASE_URL", "http://localhost:3000").replace(/\/$/, ""),
    redisUrl: readStringEnv("REDIS_URL", "redis://127.0.0.1:6379"),
    roomId: readStringEnv("DAY12_ROOM_ID", "room_1"),
    adminUserId: readStringEnv("DAY12_ADMIN_USER_ID", "admin_1"),
    bidderPrefix: readStringEnv("DAY12_BIDDER_PREFIX", "day12_user"),
    attempts,
    incrementFen,
    capPriceFen: readIntEnv("DAY12_CAP_PRICE_FEN", (attempts + 100) * incrementFen),
    durationSeconds: readIntEnv("DAY12_DURATION_SECONDS", 300),
    antiSnipingWindowSeconds: readIntEnv("DAY12_ANTI_SNIPING_WINDOW_SECONDS", 10),
    extensionSeconds: readIntEnv("DAY12_EXTENSION_SECONDS", 15),
    maxExtensionCount: readIntEnv("DAY12_MAX_EXTENSION_COUNT", 3)
  };
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = new URL(
    process.env.DATABASE_URL ?? "mysql://auction:change_me@127.0.0.1:3307/live_auction"
  );
  const database = databaseUrl.pathname.replace(/^\//, "");
  const adapter = new PrismaMariaDb(
    {
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || 3306),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database,
      connectionLimit: 5,
      connectTimeout: 1000
    },
    { database }
  );

  return new PrismaClient({ adapter });
}

async function ensureDemoFixtures(prisma: PrismaClient, input: Config): Promise<void> {
  await prisma.user.upsert({
    where: { id: input.adminUserId },
    update: {
      displayName: "Day12 Admin",
      maskedName: "Day12 Admin",
      role: UserRole.ADMIN
    },
    create: {
      id: input.adminUserId,
      displayName: "Day12 Admin",
      maskedName: "Day12 Admin",
      role: UserRole.ADMIN
    }
  });

  await prisma.liveRoom.upsert({
    where: { id: input.roomId },
    update: {
      title: "Day12 Load Test Room",
      hostUserId: input.adminUserId,
      status: LiveRoomStatus.LIVE
    },
    create: {
      id: input.roomId,
      title: "Day12 Load Test Room",
      hostUserId: input.adminUserId,
      status: LiveRoomStatus.LIVE
    }
  });

  await Promise.all(
    Array.from({ length: input.attempts }, (_, index) => {
      const id = `${input.bidderPrefix}_${index + 1}`;
      return prisma.user.upsert({
        where: { id },
        update: {
          displayName: `Day12 Bidder ${index + 1}`,
          maskedName: `D12-${index + 1}`,
          role: UserRole.BIDDER
        },
        create: {
          id,
          displayName: `Day12 Bidder ${index + 1}`,
          maskedName: `D12-${index + 1}`,
          role: UserRole.BIDDER
        }
      });
    })
  );
}

async function runBidAttempts(
  auctionId: string,
  runId: string,
  input: Config
): Promise<BidAttemptResult[]> {
  const startedAt = performance.now();
  const attempts = Array.from({ length: input.attempts }, async (_, index) => {
    const userId = `${input.bidderPrefix}_${index + 1}`;
    const amountFen = (index + 1) * input.incrementFen;
    const clientBidId = `${runId}-${index + 1}`;
    const result = await requestJson<BidResponse>(`/auctions/${auctionId}/bids`, {
      method: "POST",
      headers: bidderHeaders(userId),
      body: {
        amountFen,
        clientBidId
      }
    });

    return {
      userId,
      amountFen,
      clientBidId,
      httpStatus: result.status,
      accepted: result.ok && result.body.accepted === true,
      code: typeof result.body.code === "string" ? result.body.code : null,
      message: typeof result.body.message === "string" ? result.body.message : null,
      bidId: typeof result.body.bidId === "string" ? result.body.bidId : null,
      serverSeq: typeof result.body.serverSeq === "number" ? result.body.serverSeq : null,
      latencyMs: result.latencyMs
    };
  });
  const results = await Promise.all(attempts);
  const elapsedMs = performance.now() - startedAt;

  return results.map((result) => ({
    ...result,
    latencyMs: Number(result.latencyMs.toFixed(2)),
    message: result.message ?? `total bid wall time ${elapsedMs.toFixed(2)}ms`
  }));
}

async function cleanupAuction(auctionId: string): Promise<void> {
  try {
    await requestJson(`/admin/auctions/${auctionId}/cancel`, {
      method: "POST",
      headers: adminHeaders(config),
      body: {
        reason: "Day12 load test cleanup"
      }
    });
  } catch (error: unknown) {
    console.warn(
      `Skipped cleanup for ${auctionId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function readRedisAuctionState(
  redis: ReturnType<typeof createClient>,
  auctionId: string
): Promise<RedisAuctionState> {
  const prefix = `auction:${auctionId}`;
  const [currentPriceFen, highestBidderId, bidCount, endTimeMs, leaderboardSize] =
    await Promise.all([
      redis.get(`${prefix}:current_price_fen`),
      redis.get(`${prefix}:highest_bidder_id`),
      redis.get(`${prefix}:bid_count`),
      redis.get(`${prefix}:end_time_ms`),
      redis.zCard(`${prefix}:leaderboard`)
    ]);

  return {
    currentPriceFen: toNullableNumber(currentPriceFen),
    highestBidderId: highestBidderId && highestBidderId.length > 0 ? highestBidderId : null,
    bidCount: toNullableNumber(bidCount),
    endTimeMs: toNullableNumber(endTimeMs),
    leaderboardSize
  };
}

function verifyConsistency(input: {
  auction: AuctionDto;
  snapshot: SnapshotDto;
  orders: OrderListDto;
  redisState: RedisAuctionState;
  bidResults: BidAttemptResult[];
}) {
  const accepted = input.bidResults.filter((result) => result.accepted);
  const acceptedAmounts = accepted.map((result) => result.amountFen);
  const expectedCurrentPriceFen = acceptedAmounts.length > 0 ? Math.max(...acceptedAmounts) : 0;
  const winner = accepted.find((result) => result.amountFen === expectedCurrentPriceFen) ?? null;
  const auctionOrders = input.orders.items.filter(
    (order) => order.auctionId === input.auction.id
  );
  const checks = {
    currentPriceMatchesAcceptedMax:
      input.auction.currentPriceFen === expectedCurrentPriceFen &&
      input.snapshot.currentPriceFen === expectedCurrentPriceFen,
    bidCountMatchesAccepted:
      input.auction.bidCount === accepted.length && input.snapshot.bidCount === accepted.length,
    highestBidderUnique: winner ? input.auction.highestBidderId === winner.userId : true,
    noDuplicateOrders: auctionOrders.length <= 1,
    redisMatchesDb:
      input.redisState.currentPriceFen === input.auction.currentPriceFen &&
      input.redisState.highestBidderId === input.auction.highestBidderId &&
      input.redisState.bidCount === input.auction.bidCount,
    leaderboardCoversAcceptedBidders: input.redisState.leaderboardSize === accepted.length
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    acceptedCount: accepted.length,
    rejectedCount: input.bidResults.length - accepted.length,
    expectedCurrentPriceFen,
    winnerUserId: winner?.userId ?? null,
    orderCount: auctionOrders.length
  };
}

function buildReport(input: {
  runId: string;
  auctionId: string;
  bidResults: BidAttemptResult[];
  auction: AuctionDto;
  snapshot: SnapshotDto;
  redisState: RedisAuctionState;
  verification: ReturnType<typeof verifyConsistency>;
}) {
  const latencies = input.bidResults.map((result) => result.latencyMs);
  const accepted = input.bidResults.filter((result) => result.accepted);
  const errorCodes = input.bidResults.reduce<Record<string, number>>((acc, result) => {
    if (result.code) {
      acc[result.code] = (acc[result.code] ?? 0) + 1;
    }
    return acc;
  }, {});

  return {
    scenario: `Day12 HTTP concurrent bids (${input.bidResults.length} attempts)`,
    runId: input.runId,
    auctionId: input.auctionId,
    environment: {
      apiBaseUrl: config.apiBaseUrl,
      redisUrl: redactRedisUrl(config.redisUrl),
      roomId: config.roomId
    },
    bidAttempts: input.bidResults.length,
    acceptedBidCount: accepted.length,
    rejectedBidCount: input.bidResults.length - accepted.length,
    acceptedRate: `${((accepted.length / input.bidResults.length) * 100).toFixed(2)}%`,
    averageLatencyMs: Number(average(latencies).toFixed(2)),
    p95LatencyMs: Number(percentile(latencies, 95).toFixed(2)),
    maxLatencyMs: Number(Math.max(...latencies).toFixed(2)),
    observedErrorCodes: errorCodes,
    finalAuction: {
      status: input.auction.status,
      currentPriceFen: input.auction.currentPriceFen,
      highestBidderId: input.auction.highestBidderId,
      bidCount: input.auction.bidCount
    },
    finalSnapshot: input.snapshot,
    redisState: input.redisState,
    consistencyVerification: input.verification
  };
}

async function requestJson<T>(
  path: string,
  options: {
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<HttpResult<T>> {
  const startedAt = performance.now();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: options.method,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  const latencyMs = performance.now() - startedAt;

  if (!response.ok && response.status >= 500) {
    throw new Error(`HTTP ${response.status} ${path}: ${text}`);
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
    latencyMs
  };
}

function adminHeaders(input: Config): Record<string, string> {
  return {
    "x-demo-user-id": input.adminUserId,
    "x-demo-role": "admin"
  };
}

function bidderHeaders(userId: string): Record<string, string> {
  return {
    "x-demo-user-id": userId,
    "x-demo-role": "bidder"
  };
}

function readStringEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function toNullableNumber(value: string | null): number | null {
  if (value === null || value === "") {
    return null;
  }

  return Number(value);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percent: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percent / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
}

function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return "redis://****";
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
