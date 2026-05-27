import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Socket } from "socket.io";
import {
  AuctionWebSocketEvent,
  auctionRoomName,
  userRoomName
} from "@live-auction/shared";
import { BidService } from "../bid/bid.service";
import { AuctionRealtimeGateway } from "./auction-realtime.gateway";
import { AuctionSnapshotService } from "./auction-snapshot.service";

class FakeSnapshotService {
  readonly existingRooms = new Set<string>(["room_1"]);
  readonly existingAuctions = new Map<string, { roomId: string; serverSeq: number }>([
    ["auction_1", { roomId: "room_1", serverSeq: 7 }]
  ]);

  async ensureRoomExists(roomId: string): Promise<void> {
    if (!this.existingRooms.has(roomId)) {
      throw new Error(`room ${roomId} not found`);
    }
  }

  async ensureAuctionExists(auctionId: string): Promise<void> {
    if (!this.existingAuctions.has(auctionId)) {
      throw new Error(`auction ${auctionId} not found`);
    }
  }

  async getSnapshot(auctionId: string, userId: string) {
    const meta = this.existingAuctions.get(auctionId);
    assert.ok(meta);

    return {
      auctionId,
      roomId: meta.roomId,
      status: "RUNNING",
      currentPriceFen: 1000,
      nextBidAmountFen: 2000,
      highestBidderMaskedName: "张**",
      myBidAmountFen: userId === "user_1" ? 1000 : null,
      myRank: userId === "user_1" ? 1 : null,
      bidCount: 1,
      participantCount: 1,
      endTime: "2026-06-01T10:00:00.000Z",
      serverTime: "2026-06-01T09:59:50.000Z",
      serverSeq: meta.serverSeq,
      leaderboard: []
    };
  }

  async getAuctionMeta(auctionId: string) {
    const meta = this.existingAuctions.get(auctionId);
    assert.ok(meta);

    return {
      auctionId,
      roomId: meta.roomId,
      serverSeq: meta.serverSeq
    };
  }
}

class FakeBidService {
  async placeBid() {
    return {
      accepted: true
    };
  }
}

class FakeSocket {
  readonly data: Record<string, unknown> = {};
  readonly joinedRooms: string[] = [];
  readonly leftRooms: string[] = [];
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  disconnected = false;
  readonly handshake = {
    auth: {
      userId: "user_1",
      role: "bidder"
    },
    headers: {}
  };

  async join(room: string): Promise<void> {
    this.joinedRooms.push(room);
  }

  async leave(room: string): Promise<void> {
    this.leftRooms.push(room);
  }

  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

describe("AuctionRealtimeGateway", () => {
  it("joins user, live room, and auction rooms without cross-room broadcasts", async () => {
    const gateway = makeGateway();
    const socket = new FakeSocket();

    await gateway.handleConnection(socket as unknown as Socket);
    const joinRoomAck = await gateway.handleJoinRoom(
      socket as unknown as Socket,
      { roomId: "room_1" }
    );
    const joinAuctionAck = await gateway.handleJoinAuction(
      socket as unknown as Socket,
      { auctionId: "auction_1" }
    );

    assert.equal(socket.disconnected, false);
    assert.deepEqual(socket.joinedRooms, [
      userRoomName("user_1"),
      "room:room_1",
      auctionRoomName("auction_1")
    ]);
    assert.deepEqual(joinRoomAck, { ok: true, room: "room:room_1" });
    assert.deepEqual(joinAuctionAck, { ok: true, room: auctionRoomName("auction_1") });
  });

  it("emits an AUCTION_SNAPSHOT to the requesting socket after reconnect", async () => {
    const gateway = makeGateway();
    const socket = new FakeSocket();
    await gateway.handleConnection(socket as unknown as Socket);

    const ack = await gateway.handleRequestSnapshot(
      socket as unknown as Socket,
      { auctionId: "auction_1" }
    );

    assert.equal(ack.ok, true);
    assert.equal(socket.emitted.length, 1);
    assert.equal(socket.emitted[0]?.event, AuctionWebSocketEvent.AuctionSnapshot);
    assert.equal(
      (socket.emitted[0]?.payload as { auctionId?: string }).auctionId,
      "auction_1"
    );
    assert.equal(
      (socket.emitted[0]?.payload as { serverSeq?: number }).serverSeq,
      7
    );
  });
});

function makeGateway(): AuctionRealtimeGateway {
  return new AuctionRealtimeGateway(
    new FakeSnapshotService() as unknown as AuctionSnapshotService,
    new FakeBidService() as unknown as BidService
  );
}
