export enum AuctionErrorCode {
  AuctionNotFound = "AUCTION_NOT_FOUND",
  ItemNotFound = "ITEM_NOT_FOUND",
  RoomNotFound = "ROOM_NOT_FOUND",
  OrderNotFound = "ORDER_NOT_FOUND",
  AuctionNotRunning = "AUCTION_NOT_RUNNING",
  AuctionAlreadyEnded = "AUCTION_ALREADY_ENDED",
  AuctionCancelled = "AUCTION_CANCELLED",
  BidAmountTooLow = "BID_AMOUNT_TOO_LOW",
  BidIncrementInvalid = "BID_INCREMENT_INVALID",
  BidExceedsCapPrice = "BID_EXCEEDS_CAP_PRICE",
  BidderAlreadyLeading = "BIDDER_ALREADY_LEADING",
  DuplicateClientBid = "DUPLICATE_CLIENT_BID",
  InvalidAuctionTransition = "INVALID_AUCTION_TRANSITION",
  RuleCannotBeChangedAfterStart = "RULE_CANNOT_BE_CHANGED_AFTER_START",
  OrderAlreadyCreated = "ORDER_ALREADY_CREATED",
  OrderAlreadyPaid = "ORDER_ALREADY_PAID",
  Unauthorized = "UNAUTHORIZED",
  Forbidden = "FORBIDDEN",
  ValidationFailed = "VALIDATION_FAILED"
}

export interface ApiErrorResponse {
  code: AuctionErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}
