import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { AuctionErrorCode } from "@live-auction/shared";
import {
  AdminDemoAuthGuard,
  BidderDemoAuthGuard
} from "../common/demo-auth.guard";
import { ApiException } from "../common/api-error";
import { AiController } from "./ai.controller";
import type { AiAuctionInsightService } from "./ai-auction-insight.service";

describe("AI auction insight API surface", () => {
  it("allows admin demo identity to call admin AI endpoint", () => {
    const guard = new AdminDemoAuthGuard();

    assert.equal(guard.canActivate(makeContext("admin")), true);
  });

  it("rejects bidder demo identity on admin AI endpoint", () => {
    const guard = new AdminDemoAuthGuard();

    assert.throws(
      () => guard.canActivate(makeContext("bidder")),
      (error: unknown) => {
        assert.ok(error instanceof ApiException);
        const response = error.getResponse() as { code: AuctionErrorCode };
        assert.equal(response.code, AuctionErrorCode.Forbidden);
        return true;
      }
    );
  });

  it("allows bidder demo identity to call public AI insight endpoint", () => {
    const guard = new BidderDemoAuthGuard();

    assert.equal(guard.canActivate(makeContext("bidder")), true);
  });

  it("routes controller calls to AI service methods", async () => {
    const calls: string[] = [];
    const controller = new AiController({
      generateInsight: async () => {
        calls.push("generate");
        return { id: "insight_1" };
      },
      getPublicInsight: async () => {
        calls.push("public");
        return { source: "mock" };
      }
    } as unknown as AiAuctionInsightService);

    await controller.generateAuctionInsight({ itemName: "茶具" }, {
      headers: {},
      demoUser: { userId: "admin_1", role: "admin" }
    });
    await controller.getAuctionInsight("auction_1");

    assert.deepEqual(calls, ["generate", "public"]);
  });
});

function makeContext(role: "admin" | "bidder"): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          "x-demo-user-id": role === "admin" ? "admin_1" : "user_1",
          "x-demo-role": role
        }
      })
    })
  } as unknown as ExecutionContext;
}
