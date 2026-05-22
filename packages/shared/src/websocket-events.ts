export enum AuctionWebSocketEvent {
  AuctionStarted = "AUCTION_STARTED",
  AuctionSnapshot = "AUCTION_SNAPSHOT",
  BidAccepted = "BID_ACCEPTED",
  BidRejected = "BID_REJECTED",
  Outbid = "OUTBID",
  Leading = "LEADING",
  AuctionExtended = "AUCTION_EXTENDED",
  AuctionEnded = "AUCTION_ENDED",
  OrderCreated = "ORDER_CREATED",
  AuctionCancelled = "AUCTION_CANCELLED",
  Ping = "PING",
  Pong = "PONG"
}

export const auctionRoomName = (auctionId: string) => `auction:${auctionId}`;
export const liveRoomName = (roomId: string) => `room:${roomId}`;
export const userRoomName = (userId: string) => `user:${userId}`;

export interface ServerEventMeta {
  eventId: string;
  auctionId: string;
  roomId: string;
  serverSeq: number;
  serverTime: string;
}

export interface SequencedAuctionEventPayload extends ServerEventMeta {
  type: AuctionWebSocketEvent;
}

export interface PongPayload {
  eventId: string;
  serverTime: string;
}
