import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCorsOriginDelegate,
  getAllowedWebOrigins
} from "./cors-origins";

describe("cors origins", () => {
  it("allows localhost and 127.0.0.1 frontend dev origins by default", async () => {
    const allow = createCorsOriginDelegate();

    assert.equal(await checkOrigin(allow, "http://localhost:5173"), true);
    assert.equal(await checkOrigin(allow, "http://127.0.0.1:5173"), true);
    assert.equal(await checkOrigin(allow, "http://localhost:5174"), true);
    assert.equal(await checkOrigin(allow, "http://127.0.0.1:5174"), true);
  });

  it("parses comma-separated environment origins and trims trailing slashes", () => {
    const origins = getAllowedWebOrigins({
      ADMIN_WEB_URL: "http://192.168.1.8:5173/, http://admin.local:5173",
      MOBILE_WEB_URL: "http://192.168.1.8:5174/"
    });

    assert.ok(origins.includes("http://192.168.1.8:5173"));
    assert.ok(origins.includes("http://admin.local:5173"));
    assert.ok(origins.includes("http://192.168.1.8:5174"));
  });

  it("allows same-origin or server-to-server requests without an Origin header", async () => {
    const allow = createCorsOriginDelegate();

    assert.equal(await checkOrigin(allow, undefined), true);
  });

  it("rejects unconfigured browser origins", async () => {
    const allow = createCorsOriginDelegate();

    assert.equal(await checkOrigin(allow, "https://evil.example"), false);
  });
});

function checkOrigin(
  allow: ReturnType<typeof createCorsOriginDelegate>,
  origin: string | undefined
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    allow(origin, (error, accepted) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(accepted === true);
    });
  });
}
