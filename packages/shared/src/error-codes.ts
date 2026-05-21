export enum AuctionErrorCode {
  AuctionAlreadyEnded = "AUCTION_ALREADY_ENDED",
  AuctionNotRunning = "AUCTION_NOT_RUNNING",
  AuctionCancelled = "AUCTION_CANCELLED",
  BidAmountTooLow = "BID_AMOUNT_TOO_LOW",
  BidIncrementInvalid = "BID_INCREMENT_INVALID",
  BidderAlreadyLeading = "BIDDER_ALREADY_LEADING",
  BidDuplicateClientId = "BID_DUPLICATE_CLIENT_ID",
  CapPriceExceeded = "CAP_PRICE_EXCEEDED",
  InvalidAuctionTransition = "INVALID_AUCTION_TRANSITION",
  RuleModificationNotAllowed = "RULE_MODIFICATION_NOT_ALLOWED",
  ValidationFailed = "VALIDATION_FAILED"
}

export interface ApiErrorResponse {
  code: AuctionErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}
