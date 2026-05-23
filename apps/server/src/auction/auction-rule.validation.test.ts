import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuctionErrorCode, AuctionStatus } from "@live-auction/shared";
import { ApiException } from "../common/api-error";
import {
  assertAuctionRuleEditable,
  parseCreateAuctionRule,
  parsePatchAuctionRule
} from "./auction-rule.validation";

describe("auction rule validation", () => {
  it("accepts zero start price", () => {
    const rule = parseCreateAuctionRule({
      startPriceFen: 0,
      incrementFen: 1000,
      durationSeconds: 300,
      capPriceFen: 100000,
      antiSnipingWindowSeconds: 10,
      extensionSeconds: 15,
      maxExtensionCount: 3
    });

    assert.equal(rule.startPriceFen, 0);
    assert.equal(rule.incrementFen, 1000);
  });

  it("rejects non-positive increment", () => {
    expectApiError(
      () =>
        parseCreateAuctionRule({
          startPriceFen: 0,
          incrementFen: 0,
          durationSeconds: 300,
          capPriceFen: 100000,
          antiSnipingWindowSeconds: 10,
          extensionSeconds: 15
        }),
      AuctionErrorCode.ValidationFailed,
      "incrementFen"
    );
  });

  it("rejects cap price not greater than start price", () => {
    expectApiError(
      () =>
        parseCreateAuctionRule({
          startPriceFen: 100000,
          incrementFen: 1000,
          durationSeconds: 300,
          capPriceFen: 100000,
          antiSnipingWindowSeconds: 10,
          extensionSeconds: 15
        }),
      AuctionErrorCode.ValidationFailed,
      "capPriceFen"
    );
  });

  it("validates partial rule updates against current values", () => {
    const patch = parsePatchAuctionRule(
      {
        incrementFen: 2000,
        extensionSeconds: 20
      },
      {
        startPriceFen: 0,
        incrementFen: 1000,
        durationSeconds: 300,
        capPriceFen: 100000,
        antiSnipingWindowSeconds: 10,
        extensionSeconds: 15,
        maxExtensionCount: 3
      }
    );

    assert.deepEqual(patch, {
      incrementFen: 2000,
      extensionSeconds: 20
    });
  });

  it("rejects rule changes after auction starts", () => {
    expectApiError(
      () => assertAuctionRuleEditable(AuctionStatus.Running, "auction_1"),
      AuctionErrorCode.RuleCannotBeChangedAfterStart
    );
  });
});

function expectApiError(
  action: () => void,
  code: AuctionErrorCode,
  field?: string
): void {
  try {
    action();
  } catch (error: unknown) {
    assert.ok(error instanceof ApiException);
    const response = error.getResponse() as {
      code: AuctionErrorCode;
      details?: Record<string, unknown>;
    };
    assert.equal(response.code, code);
    if (field) {
      assert.equal(response.details?.field, field);
    }
    return;
  }

  assert.fail("Expected ApiException");
}
