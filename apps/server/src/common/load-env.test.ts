import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLocalEnv } from "./load-env";

const originalEnv = { ...process.env };

describe("loadLocalEnv", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads values from the nearest ancestor .env file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "live-auction-env-"));
    const nested = path.join(root, "apps", "server");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(root, ".env"),
      ["AI_PROVIDER=ark", "AI_MODEL=ep-test"].join("\n"),
      "utf8"
    );
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;

    loadLocalEnv(nested);

    assert.equal(process.env.AI_PROVIDER, "ark");
    assert.equal(process.env.AI_MODEL, "ep-test");
  });

  it("does not override externally provided environment variables", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "live-auction-env-"));
    fs.writeFileSync(path.join(root, ".env"), "AI_PROVIDER=ark", "utf8");
    process.env.AI_PROVIDER = "mock";

    loadLocalEnv(root);

    assert.equal(process.env.AI_PROVIDER, "mock");
  });
});
