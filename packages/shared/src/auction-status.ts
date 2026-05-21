export enum AuctionStatus {
  Draft = "DRAFT",
  Scheduled = "SCHEDULED",
  Running = "RUNNING",
  EndedSold = "ENDED_SOLD",
  EndedUnsold = "ENDED_UNSOLD",
  Cancelled = "CANCELLED"
}

export const allowedAuctionTransitions: Readonly<Record<AuctionStatus, readonly AuctionStatus[]>> = {
  [AuctionStatus.Draft]: [AuctionStatus.Scheduled],
  [AuctionStatus.Scheduled]: [AuctionStatus.Running, AuctionStatus.Cancelled],
  [AuctionStatus.Running]: [
    AuctionStatus.EndedSold,
    AuctionStatus.EndedUnsold,
    AuctionStatus.Cancelled
  ],
  [AuctionStatus.EndedSold]: [],
  [AuctionStatus.EndedUnsold]: [],
  [AuctionStatus.Cancelled]: []
};
