import {
  AuctionClientSocketEvent,
  AuctionErrorCode,
  AuctionStatus,
  type ApiErrorResponse,
  type AuctionSnapshot
} from "@live-auction/shared";
import { io, type Socket } from "socket.io-client";

export interface LiveRoomViewModel {
  roomId: string;
  hostName: string;
  hostBadge: string;
  viewerCount: number;
  likeCount: number;
  streamTitle: string;
  streamPosterUrl: string;
  auction: MobileAuctionDetail;
  snapshot: AuctionSnapshot;
  comments: LiveComment[];
}

export interface MobileAuctionDetail {
  auctionId: string;
  roomId: string;
  item: {
    id: string;
    name: string;
    imageUrl: string;
    description: string;
    sellingPoints: string[];
  };
  startPriceFen: number;
  incrementFen: number;
  capPriceFen: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
}

export interface LiveComment {
  id: string;
  kind: "chat" | "bid" | "system";
  author: string;
  text: string;
}

export interface MobileClientConfig {
  apiBaseUrl: string;
  socketUrl: string;
  roomId: string;
  userId: string;
}

export interface RoomAuctionListDto {
  items: RoomAuctionListItemDto[];
}

export interface RoomAuctionListItemDto {
  auctionId: string;
  roomId: string;
  itemId: string;
  itemName: string;
  itemImageUrl: string;
  status: AuctionStatus;
  currentPriceFen: number;
  startPriceFen: number;
  nextBidAmountFen: number;
  bidCount: number;
  participantCount: number;
  endTime: string | null;
  serverTime: string;
  serverSeq: number;
}

export interface PublicAuctionDto {
  auctionId: string;
  roomId: string;
  item: {
    id: string;
    name: string;
    imageUrl: string;
    description: string;
    sellingPoints: string[];
  };
  status: AuctionStatus;
  startPriceFen: number;
  currentPriceFen: number;
  incrementFen: number;
  capPriceFen: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
  endTime: string | null;
  serverTime: string;
  serverSeq: number;
}

export interface PlaceBidResultDto {
  accepted: true;
  auctionId: string;
  bidId: string;
  amountFen: number;
  currentPriceFen: number;
  previousPriceFen: number | null;
  previousHighestBidderId: string | null;
  highestBidderId: string | null;
  bidCount: number;
  serverSeq: number;
  extended: boolean;
  endTime: string | null;
  reachedCapPrice: boolean;
  status: AuctionStatus;
  orderId?: string;
  idempotent: boolean;
}

export interface SocketAck<T = unknown> {
  ok: boolean;
  error?: ApiErrorResponse;
  snapshot?: AuctionSnapshot & { eventId?: string };
  result?: T;
  [key: string]: unknown;
}

export type MobileAuctionSocket = Socket;

export class MobileApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_API_BASE_URL = "http://localhost:3000";
const DEFAULT_ROOM_ID = "room_1";
const DEFAULT_USER_ID = "user_1";
const DEFAULT_STREAM_POSTER_URL =
  "https://images.unsplash.com/photo-1523906630133-f6934a1ab2b9?auto=format&fit=crop&w=1200&q=80";
const DEFAULT_ITEM_IMAGE_URL =
  "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=80";

export function readMobileClientConfig(): MobileClientConfig {
  const params = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search
  );
  const apiBaseUrl = normalizeBaseUrl(
    readFirstValue(
      params.get("apiBaseUrl"),
      import.meta.env.VITE_API_BASE_URL,
      DEFAULT_API_BASE_URL
    )
  );

  return {
    apiBaseUrl,
    socketUrl: normalizeBaseUrl(
      readFirstValue(params.get("socketUrl"), import.meta.env.VITE_SOCKET_URL, apiBaseUrl)
    ),
    roomId: readFirstValue(params.get("roomId"), import.meta.env.VITE_ROOM_ID, DEFAULT_ROOM_ID),
    userId: readFirstValue(params.get("userId"), import.meta.env.VITE_DEMO_USER_ID, DEFAULT_USER_ID)
  };
}

export async function loadLiveRoom(
  config: MobileClientConfig
): Promise<LiveRoomViewModel> {
  const list = await listRoomAuctions(config);
  const selected = selectAuction(list.items);

  if (!selected) {
    throw new MobileApiError(
      404,
      AuctionErrorCode.AuctionNotFound,
      "当前直播间暂无竞拍商品"
    );
  }

  const [auction, snapshot] = await Promise.all([
    getAuctionDetail(config, selected.auctionId),
    getAuctionSnapshot(config, selected.auctionId)
  ]);

  return toLiveRoomViewModel(auction, snapshot);
}

export async function listRoomAuctions(
  config: MobileClientConfig
): Promise<RoomAuctionListDto> {
  return requestJson(config, `/rooms/${encodeURIComponent(config.roomId)}/auctions`);
}

export async function getAuctionDetail(
  config: MobileClientConfig,
  auctionId: string
): Promise<PublicAuctionDto> {
  return requestJson(config, `/auctions/${encodeURIComponent(auctionId)}`);
}

export async function getAuctionSnapshot(
  config: MobileClientConfig,
  auctionId: string
): Promise<AuctionSnapshot> {
  return requestJson(config, `/auctions/${encodeURIComponent(auctionId)}/snapshot`);
}

export async function placeBidByRest(
  config: MobileClientConfig,
  auctionId: string,
  amountFen: number,
  clientBidId: string
): Promise<PlaceBidResultDto> {
  return requestJson(config, `/auctions/${encodeURIComponent(auctionId)}/bids`, {
    method: "POST",
    body: JSON.stringify({
      amountFen,
      clientBidId
    })
  });
}

export function createAuctionSocket(
  config: MobileClientConfig
): MobileAuctionSocket {
  return io(config.socketUrl, {
    auth: {
      userId: config.userId,
      role: "bidder"
    },
    transports: ["websocket", "polling"],
    withCredentials: true
  });
}

export async function joinRealtimeRooms(
  socket: MobileAuctionSocket,
  roomId: string,
  auctionId: string
): Promise<void> {
  await requireSocketAck(
    socket,
    AuctionClientSocketEvent.JoinRoom,
    { roomId },
    "加入直播间失败"
  );
  await requireSocketAck(
    socket,
    AuctionClientSocketEvent.JoinAuction,
    { auctionId },
    "加入竞拍房间失败"
  );
}

export async function requestSocketSnapshot(
  socket: MobileAuctionSocket,
  auctionId: string
): Promise<AuctionSnapshot> {
  const ack = await requireSocketAck(
    socket,
    AuctionClientSocketEvent.RequestSnapshot,
    { auctionId },
    "同步竞拍快照失败"
  );

  if (!ack.snapshot) {
    throw new MobileApiError(502, "SOCKET_SNAPSHOT_EMPTY", "实时快照为空");
  }

  return ack.snapshot;
}

export function createClientBidId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getDisplayErrorMessage(error: unknown): string {
  if (error instanceof MobileApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "请求失败，请稍后重试";
}

export function toLiveRoomViewModel(
  auction: PublicAuctionDto,
  snapshot: AuctionSnapshot
): LiveRoomViewModel {
  return {
    roomId: auction.roomId,
    hostName: "阿澄严选",
    hostBadge: "实时竞拍专场",
    viewerCount: Math.max(128, snapshot.participantCount + 128),
    likeCount: 9320 + snapshot.bidCount * 17,
    streamTitle: "今晚 3 组茶器轮拍",
    streamPosterUrl: DEFAULT_STREAM_POSTER_URL,
    auction: {
      auctionId: auction.auctionId,
      roomId: auction.roomId,
      item: {
        id: auction.item.id,
        name: auction.item.name,
        imageUrl: resolveImageUrl(auction.item.imageUrl, DEFAULT_ITEM_IMAGE_URL),
        description: auction.item.description,
        sellingPoints: auction.item.sellingPoints
      },
      startPriceFen: auction.startPriceFen,
      incrementFen: auction.incrementFen,
      capPriceFen: auction.capPriceFen,
      antiSnipingWindowSeconds: auction.antiSnipingWindowSeconds,
      extensionSeconds: auction.extensionSeconds,
      maxExtensionCount: auction.maxExtensionCount
    },
    snapshot,
    comments: createInitialComments(auction, snapshot)
  };
}

export function appendLiveComment(
  comments: LiveComment[],
  comment: Omit<LiveComment, "id">
): LiveComment[] {
  return [
    {
      id: `comment_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ...comment
    },
    ...comments
  ].slice(0, 8);
}

async function requestJson<T>(
  config: MobileClientConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Demo-Role": "bidder",
        "X-Demo-User-Id": config.userId,
        ...init.headers
      }
    });
  } catch (error: unknown) {
    throw new MobileApiError(
      0,
      "NETWORK_ERROR",
      error instanceof Error ? error.message : "无法连接服务端"
    );
  }

  const body = await readResponseBody(response);

  if (!response.ok) {
    const apiError = isApiErrorResponse(body)
      ? body
      : {
          code: "HTTP_ERROR",
          message: response.statusText || "请求失败"
        };

    throw new MobileApiError(
      response.status,
      apiError.code,
      apiError.message,
      apiError.details
    );
  }

  return body as T;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof (value as ApiErrorResponse).code === "string" &&
    typeof (value as ApiErrorResponse).message === "string"
  );
}

async function requireSocketAck(
  socket: MobileAuctionSocket,
  event: AuctionClientSocketEvent,
  payload: Record<string, unknown>,
  fallbackMessage: string
): Promise<SocketAck> {
  const ack = await emitWithAck<SocketAck>(socket, event, payload);

  if (!ack.ok) {
    throw new MobileApiError(
      502,
      ack.error?.code ?? "SOCKET_ACK_FAILED",
      ack.error?.message ?? fallbackMessage,
      ack.error?.details
    );
  }

  return ack;
}

function emitWithAck<T>(
  socket: MobileAuctionSocket,
  event: AuctionClientSocketEvent,
  payload: Record<string, unknown>,
  timeoutMs = 4_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(
      event,
      payload,
      (error: Error | null, response: T | undefined) => {
        if (error) {
          reject(new MobileApiError(504, "SOCKET_ACK_TIMEOUT", "实时通道响应超时"));
          return;
        }

        if (!response) {
          reject(new MobileApiError(502, "SOCKET_ACK_EMPTY", "实时通道响应为空"));
          return;
        }

        resolve(response);
      }
    );
  });
}

function selectAuction(items: RoomAuctionListItemDto[]): RoomAuctionListItemDto | null {
  return (
    items.find((item) => item.status === AuctionStatus.Running) ??
    items.find((item) => item.status === AuctionStatus.Scheduled) ??
    items.find((item) => item.status === AuctionStatus.EndedSold) ??
    items.find((item) => item.status === AuctionStatus.EndedUnsold) ??
    items[0] ??
    null
  );
}

function createInitialComments(
  auction: PublicAuctionDto,
  snapshot: AuctionSnapshot
): LiveComment[] {
  const priceText = formatFenForService(snapshot.currentPriceFen);
  const statusComment =
    snapshot.status === AuctionStatus.Running
      ? `竞拍进行中，当前价 ${priceText}。`
      : `当前状态：${statusText(snapshot.status)}。`;

  return [
    {
      id: "comment_status",
      kind: "system",
      author: "系统",
      text: statusComment
    },
    {
      id: "comment_item",
      kind: "chat",
      author: "林**",
      text: `${auction.item.name} 可以看一下细节。`
    },
    {
      id: "comment_rule",
      kind: "system",
      author: "系统",
      text: `${formatFenForService(auction.startPriceFen)} 起拍，${formatFenForService(
        auction.incrementFen
      )} 加价。`
    }
  ];
}

function resolveImageUrl(value: string, fallback: string): string {
  const normalized = value.trim();

  if (normalized.length === 0 || normalized.includes("example.com")) {
    return fallback;
  }

  return normalized;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function readFirstValue(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function statusText(status: AuctionStatus): string {
  switch (status) {
    case AuctionStatus.Draft:
      return "草稿";
    case AuctionStatus.Scheduled:
      return "未开始";
    case AuctionStatus.Running:
      return "竞拍中";
    case AuctionStatus.EndedSold:
      return "已成交";
    case AuctionStatus.EndedUnsold:
      return "已流拍";
    case AuctionStatus.Cancelled:
      return "已取消";
  }
}

function formatFenForService(value: number): string {
  return `¥${(value / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}
