import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuctionErrorCode, AuctionStatus } from "@live-auction/shared";
import { ApiException } from "../common/api-error";
import { assertAuctionTransition } from "./auction-state-machine.service";

describe("auction state transitions", () => {
  it("allows scheduled auctions to start", () => {
    assert.doesNotThrow(() =>
      assertAuctionTransition(
        AuctionStatus.Scheduled,
        AuctionStatus.Running,
        "auction_1"
      )
    );
  });

  it("allows scheduled and running auctions to be cancelled", () => {
    assert.doesNotThrow(() =>
      assertAuctionTransition(
        AuctionStatus.Scheduled,
        AuctionStatus.Cancelled,
        "auction_1"
      )
    );
    assert.doesNotThrow(() =>
      assertAuctionTransition(
        AuctionStatus.Running,
        AuctionStatus.Cancelled,
        "auction_1"
      )
    );
  });

  it("rejects invalid transitions", () => {
    try {
      assertAuctionTransition(
        AuctionStatus.Running,
        AuctionStatus.Scheduled,
        "auction_1"
      );
    } catch (error: unknown) {
      assert.ok(error instanceof ApiException);
      const response = error.getResponse() as {
        code: AuctionErrorCode;
        details?: Record<string, unknown>;
      };
      assert.equal(response.code, AuctionErrorCode.InvalidAuctionTransition);
      assert.equal(response.details?.from, AuctionStatus.Running);
      assert.equal(response.details?.to, AuctionStatus.Scheduled);
      return;
    }

    assert.fail("Expected invalid transition to throw");
  });
});
