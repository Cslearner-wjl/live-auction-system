import { performance } from "node:perf_hooks";
import {
  AuctionClientSocketEvent,
  AuctionStatus,
  AuctionWebSocketEvent
} from "@live-auction/shared";
import {
  io,
  type Socket
} from "socket.io-client";

interface Config {
  socketBaseUrl: string;
  apiBaseUrl: string;
  roomId: string;
  auctionId: string | null;
  connections: number;
  durationMs: number;
  connectTimeoutMs: number;
  bidderPrefix: string;
}

interface RoomAuctionListDto {
  items: Array<{
    auctionId: string;
    status: AuctionStatus;
  }>;
}

interface ClientResult {
  userId: string;
  connected: boolean;
  joinRoomOk: boolean;
  joinAuctionOk: boolean;
  snapshotOk: boolean;
  pongOk: boolean;
  connectLatencyMs: number | null;
  snapshotLatencyMs: number | null;
  receivedEvents: Record<string, number>;
  error: string | null;
}

const config = readConfig();

async function main(): Promise<void> {
  const auctionId = config.auctionId ?? (await resolveAuctionId(config));
  const startedAt = performance.now();
  const results = await Promise.all(
    Array.from({ length: config.connections }, (_, index) =>
      runClient(index + 1, auctionId)
    )
  );
  const elapsedMs = performance.now() - startedAt;

  const report = buildReport({
    auctionId,
    elapsedMs,
    results
  });

  console.log(JSON.stringify(report, null, 2));

  if (!report.consistency.ok) {
    process.exitCode = 1;
  }
}

async function runClient(index: number, auctionId: string): Promise<ClientResult> {
  const userId = `${config.bidderPrefix}_${index}`;
  const receivedEvents: Record<string, number> = {};
  const socket = io(config.socketBaseUrl, {
    transports: ["websocket"],
    timeout: config.connectTimeoutMs,
    auth: {
      userId,
      role: "bidder"
    }
  });

  for (const event of Object.values(AuctionWebSocketEvent)) {
    socket.on(event, () => {
      receivedEvents[event] = (receivedEvents[event] ?? 0) + 1;
    });
  }

  try {
    const connectStartedAt = performance.now();
    await waitForConnect(socket, config.connectTimeoutMs);
    const connectLatencyMs = performance.now() - connectStartedAt;
    const joinRoom = await emitAck(socket, AuctionClientSocketEvent.JoinRoom, {
      roomId: config.roomId
    });
    const joinAuction = await emitAck(socket, AuctionClientSocketEvent.JoinAuction, {
      auctionId
    });
    const snapshotStartedAt = performance.now();
    const snapshot = await emitAck(socket, AuctionClientSocketEvent.RequestSnapshot, {
      auctionId
    });
    const snapshotLatencyMs = performance.now() - snapshotStartedAt;
    const pong = await emitAck(socket, AuctionWebSocketEvent.Ping, {});

    if (config.durationMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.durationMs));
    }

    return {
      userId,
      connected: true,
      joinRoomOk: joinRoom.ok === true,
      joinAuctionOk: joinAuction.ok === true,
      snapshotOk: snapshot.ok === true,
      pongOk: pong.ok === true,
      connectLatencyMs: round(connectLatencyMs),
      snapshotLatencyMs: round(snapshotLatencyMs),
      receivedEvents,
      error: null
    };
  } catch (error: unknown) {
    return {
      userId,
      connected: socket.connected,
      joinRoomOk: false,
      joinAuctionOk: false,
      snapshotOk: false,
      pongOk: false,
      connectLatencyMs: null,
      snapshotLatencyMs: null,
      receivedEvents,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    socket.disconnect();
  }
}

function waitForConnect(socket: Socket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`connect timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
}

async function emitAck(
  socket: Socket,
  event: string,
  payload: Record<string, unknown>
): Promise<{ ok?: boolean; [key: string]: unknown }> {
  return socket
    .timeout(config.connectTimeoutMs)
    .emitWithAck(event, payload) as Promise<{ ok?: boolean; [key: string]: unknown }>;
}

async function resolveAuctionId(input: Config): Promise<string> {
  const response = await fetch(`${input.apiBaseUrl}/rooms/${input.roomId}/auctions`, {
    headers: bidderHeaders(`${input.bidderPrefix}_resolver`)
  });

  if (!response.ok) {
    throw new Error(`Cannot resolve auctionId: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as RoomAuctionListDto;
  const auction =
    payload.items.find((item) => item.status === AuctionStatus.Running) ??
    payload.items[0];

  if (!auction) {
    throw new Error("No auction found; set SOCKET_AUCTION_ID or create a demo auction first");
  }

  return auction.auctionId;
}

function buildReport(input: {
  auctionId: string;
  elapsedMs: number;
  results: ClientResult[];
}) {
  const connected = input.results.filter((result) => result.connected);
  const connectLatencies = input.results
    .map((result) => result.connectLatencyMs)
    .filter((value): value is number => value !== null);
  const snapshotLatencies = input.results
    .map((result) => result.snapshotLatencyMs)
    .filter((value): value is number => value !== null);
  const errorMessages = input.results.reduce<Record<string, number>>((acc, result) => {
    if (result.error) {
      acc[result.error] = (acc[result.error] ?? 0) + 1;
    }
    return acc;
  }, {});
  const consistency = {
    ok:
      connected.length === input.results.length &&
      input.results.every(
        (result) => result.joinRoomOk && result.joinAuctionOk && result.snapshotOk && result.pongOk
      ),
    connectedCount: connected.length,
    joinRoomOkCount: input.results.filter((result) => result.joinRoomOk).length,
    joinAuctionOkCount: input.results.filter((result) => result.joinAuctionOk).length,
    snapshotOkCount: input.results.filter((result) => result.snapshotOk).length,
    pongOkCount: input.results.filter((result) => result.pongOk).length
  };

  return {
    scenario: `Socket.IO room + auction snapshot (${input.results.length} connections)`,
    auctionId: input.auctionId,
    roomId: config.roomId,
    socketBaseUrl: config.socketBaseUrl,
    connections: input.results.length,
    durationMs: config.durationMs,
    wallTimeMs: round(input.elapsedMs),
    averageConnectLatencyMs: round(average(connectLatencies)),
    p95ConnectLatencyMs: round(percentile(connectLatencies, 95)),
    averageSnapshotLatencyMs: round(average(snapshotLatencies)),
    p95SnapshotLatencyMs: round(percentile(snapshotLatencies, 95)),
    observedErrors: errorMessages,
    consistency
  };
}

function readConfig(): Config {
  const socketBaseUrl = readStringEnv("SOCKET_BASE_URL", "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  return {
    socketBaseUrl,
    apiBaseUrl: readStringEnv("API_BASE_URL", socketBaseUrl).replace(/\/$/, ""),
    roomId: readStringEnv("SOCKET_ROOM_ID", "room_1"),
    auctionId: process.env.SOCKET_AUCTION_ID?.trim() || null,
    connections: readPositiveIntEnv("SOCKET_CONNECTIONS", 100),
    durationMs: readNonNegativeIntEnv("SOCKET_HOLD_DURATION_MS", 5_000),
    connectTimeoutMs: readPositiveIntEnv("SOCKET_CONNECT_TIMEOUT_MS", 5_000),
    bidderPrefix: readStringEnv("SOCKET_BIDDER_PREFIX", "socket_user")
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

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = readNonNegativeIntEnv(name, fallback);
  if (value <= 0) {
    throw new Error(`${name} must be greater than 0`);
  }
  return value;
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
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

function round(value: number): number {
  return Number(value.toFixed(2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
