import { randomUUID } from "node:crypto";
import { HttpException, Inject, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import {
  AuctionClientSocketEvent,
  AuctionErrorCode,
  AuctionWebSocketEvent,
  auctionRoomName,
  liveRoomName,
  userRoomName
} from "@live-auction/shared";
import { BidService } from "../bid/bid.service";
import { type DemoUserContext } from "../common/demo-auth.guard";
import { AuctionSnapshotService } from "./auction-snapshot.service";

interface JoinRoomPayload {
  roomId?: unknown;
}

interface JoinAuctionPayload {
  auctionId?: unknown;
}

interface RequestSnapshotPayload {
  auctionId?: unknown;
}

interface PlaceBidSocketPayload {
  auctionId?: unknown;
  amountFen?: unknown;
  clientBidId?: unknown;
}

interface SocketAck {
  ok: boolean;
  [key: string]: unknown;
}

@WebSocketGateway({
  cors: {
    origin: [
      process.env.ADMIN_WEB_URL ?? "http://localhost:5173",
      process.env.MOBILE_WEB_URL ?? "http://localhost:5174"
    ],
    credentials: true
  }
})
export class AuctionRealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AuctionRealtimeGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(
    @Inject(AuctionSnapshotService)
    private readonly snapshots: AuctionSnapshotService,
    @Inject(BidService)
    private readonly bids: BidService
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = readSocketDemoUser(client);
      client.data.demoUser = user;
      await client.join(userRoomName(user.userId));
    } catch (error: unknown) {
      client.emit(AuctionWebSocketEvent.BidRejected, {
        eventId: randomUUID(),
        serverTime: new Date().toISOString(),
        code: AuctionErrorCode.Unauthorized,
        message: error instanceof Error ? error.message : "WebSocket demo 身份无效"
      });
      client.disconnect(true);
    }
  }

  @SubscribeMessage(AuctionClientSocketEvent.JoinRoom)
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload
  ): Promise<SocketAck> {
    this.requireDemoUser(client);
    const roomId = readRequiredString(payload?.roomId, "roomId");
    await this.snapshots.ensureRoomExists(roomId);
    await client.join(liveRoomName(roomId));

    return {
      ok: true,
      room: liveRoomName(roomId)
    };
  }

  @SubscribeMessage(AuctionClientSocketEvent.JoinAuction)
  async handleJoinAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinAuctionPayload
  ): Promise<SocketAck> {
    this.requireDemoUser(client);
    const auctionId = readRequiredString(payload?.auctionId, "auctionId");
    await this.snapshots.ensureAuctionExists(auctionId);
    await client.join(auctionRoomName(auctionId));

    return {
      ok: true,
      room: auctionRoomName(auctionId)
    };
  }

  @SubscribeMessage(AuctionClientSocketEvent.LeaveAuction)
  async handleLeaveAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinAuctionPayload
  ): Promise<SocketAck> {
    this.requireDemoUser(client);
    const auctionId = readRequiredString(payload?.auctionId, "auctionId");
    await client.leave(auctionRoomName(auctionId));

    return {
      ok: true,
      room: auctionRoomName(auctionId)
    };
  }

  @SubscribeMessage(AuctionClientSocketEvent.RequestSnapshot)
  async handleRequestSnapshot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RequestSnapshotPayload
  ): Promise<SocketAck> {
    const user = this.requireDemoUser(client);
    const auctionId = readRequiredString(payload?.auctionId, "auctionId");
    const snapshot = await this.snapshots.getSnapshot(auctionId, user.userId);
    const eventPayload = {
      eventId: randomUUID(),
      ...snapshot
    };

    client.emit(AuctionWebSocketEvent.AuctionSnapshot, eventPayload);

    return {
      ok: true,
      snapshot: eventPayload
    };
  }

  @SubscribeMessage(AuctionClientSocketEvent.PlaceBid)
  async handlePlaceBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PlaceBidSocketPayload
  ): Promise<SocketAck> {
    const user = this.requireBidder(client);
    const auctionId = readRequiredString(payload?.auctionId, "auctionId");
    const amountFen = payload?.amountFen;
    const clientBidId = payload?.clientBidId;

    try {
      const result = await this.bids.placeBid(auctionId, user.userId, {
        amountFen,
        clientBidId
      });

      return {
        ok: true,
        result
      };
    } catch (error: unknown) {
      const apiError = toSocketApiError(error);
      await this.emitBidRejected(auctionId, user.userId, clientBidId, apiError);

      return {
        ok: false,
        error: apiError
      };
    }
  }

  @SubscribeMessage(AuctionWebSocketEvent.Ping)
  handlePing(@ConnectedSocket() client: Socket): SocketAck {
    this.requireDemoUser(client);
    const payload = {
      eventId: randomUUID(),
      serverTime: new Date().toISOString()
    };

    client.emit(AuctionWebSocketEvent.Pong, payload);

    return {
      ok: true,
      payload
    };
  }

  emitAuctionEvent(auctionId: string, event: AuctionWebSocketEvent, payload: unknown): void {
    this.server?.to(auctionRoomName(auctionId)).emit(event, payload);
  }

  emitRoomEvent(roomId: string, event: AuctionWebSocketEvent, payload: unknown): void {
    this.server?.to(liveRoomName(roomId)).emit(event, payload);
  }

  emitUserEvent(userId: string, event: AuctionWebSocketEvent, payload: unknown): void {
    this.server?.to(userRoomName(userId)).emit(event, payload);
  }

  emitAuctionAndRoomEvent(
    roomId: string,
    auctionId: string,
    event: AuctionWebSocketEvent,
    payload: unknown
  ): void {
    this.emitRoomEvent(roomId, event, payload);
    this.emitAuctionEvent(auctionId, event, payload);
  }

  bindServerForTest(server: Server): void {
    this.server = server;
  }

  private requireDemoUser(client: Socket): DemoUserContext {
    const user = client.data.demoUser as DemoUserContext | undefined;

    if (!user) {
      throw new WsException("WebSocket demo 身份无效");
    }

    return user;
  }

  private requireBidder(client: Socket): DemoUserContext {
    const user = this.requireDemoUser(client);

    if (user.role !== "bidder") {
      throw new WsException("当前身份无权出价");
    }

    return user;
  }

  private async emitBidRejected(
    auctionId: string,
    userId: string,
    clientBidId: unknown,
    error: { code: string; message: string; details?: Record<string, unknown> }
  ): Promise<void> {
    const now = new Date();
    let roomId = "";
    let serverSeq = 0;

    try {
      const meta = await this.snapshots.getAuctionMeta(auctionId);
      roomId = meta.roomId;
      serverSeq = meta.serverSeq;
    } catch (metaError: unknown) {
      this.logger.warn(
        `Cannot load auction meta for BID_REJECTED: ${
          metaError instanceof Error ? metaError.message : String(metaError)
        }`
      );
    }

    this.emitUserEvent(userId, AuctionWebSocketEvent.BidRejected, {
      eventId: randomUUID(),
      auctionId,
      roomId,
      serverSeq,
      serverTime: now.toISOString(),
      clientBidId: typeof clientBidId === "string" ? clientBidId : null,
      ...error
    });
  }
}

function readSocketDemoUser(client: Socket): DemoUserContext {
  const auth = isRecord(client.handshake.auth) ? client.handshake.auth : {};
  const userId =
    readString(auth.userId) ??
    readHeader(client.handshake.headers["x-demo-user-id"]);
  const role =
    readString(auth.role) ??
    readHeader(client.handshake.headers["x-demo-role"]);

  if (!userId || !role) {
    throw new Error("缺少 WebSocket demo 身份");
  }

  if (role !== "admin" && role !== "bidder") {
    throw new Error("未知 WebSocket demo 身份角色");
  }

  return {
    userId,
    role
  };
}

function readRequiredString(value: unknown, field: string): string {
  const text = readString(value);

  if (!text) {
    throw new WsException(`${field} is required`);
  }

  return text;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return readString(value[0]);
  }

  return readString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSocketApiError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof HttpException) {
    const response = error.getResponse();

    if (isRecord(response)) {
      return {
        code: readString(response.code) ?? "UNKNOWN_ERROR",
        message: readString(response.message) ?? "请求失败",
        details: isRecord(response.details) ? response.details : undefined
      };
    }
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "请求失败"
  };
}
