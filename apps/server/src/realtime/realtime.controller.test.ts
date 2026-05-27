import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuctionSnapshotService } from "./auction-snapshot.service";
import { RealtimeController } from "./realtime.controller";

type ReflectWithMetadata = typeof Reflect & {
  getMetadata(key: string, target: unknown): Array<{ index: number; param: unknown }> | undefined;
};

describe("RealtimeController", () => {
  it("declares explicit injection metadata for AuctionSnapshotService", () => {
    const dependencies = (Reflect as ReflectWithMetadata).getMetadata(
      "self:paramtypes",
      RealtimeController
    );

    assert.deepEqual(dependencies, [
      {
        index: 0,
        param: AuctionSnapshotService
      }
    ]);
  });
});
