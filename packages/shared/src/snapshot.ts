import type { AuctionStatus } from "./auction-status";

export interface AuctionSnapshot {
  auctionId: string;
  roomId: string;
  status: AuctionStatus;
  currentPriceFen: number;
  nextBidAmountFen: number;
  highestBidderMaskedName: string | null;
  myBidAmountFen: number | null;
  myRank: number | null;
  bidCount: number;
  participantCount: number;
  endTime: string | null;
  serverTime: string;
  serverSeq: number;
  leaderboard: AuctionLeaderboardEntry[];
}

export interface AuctionLeaderboardEntry {
  rank: number;
  userId: string;
  maskedName: string;
  amountFen: number;
  bidTime: string;
}
