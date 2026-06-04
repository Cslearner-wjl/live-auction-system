import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AuctionErrorCode } from "@live-auction/shared";
import { AdminUploadsService } from "./admin-uploads.service";

const onePixelPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const onePixelGifBase64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

describe("AdminUploadsService", () => {
  it("stores a valid uploaded image under the static upload root", async () => {
    const fixture = await makeUploadFixture();

    try {
      const service = new AdminUploadsService();
      const result = await service.uploadItemImage({
        fileName: "item.png",
        contentType: "image/png",
        base64: onePixelPngBase64
      });

      assert.match(result.url, /^http:\/\/uploads\.test\/uploads\/items\/.+\.png$/);
      assert.match(result.path, /^\/uploads\/items\/.+\.png$/);

      const stored = await readFile(join(fixture.tempDir, "public", result.path.slice(1)));
      assert.equal(stored.toString("base64"), onePixelPngBase64);
    } finally {
      await fixture.dispose();
    }
  });

  it("rejects invalid base64 before writing a file", async () => {
    const fixture = await makeUploadFixture();

    try {
      const service = new AdminUploadsService();

      await assert.rejects(
        () =>
          service.uploadItemImage({
            fileName: "item.png",
            contentType: "image/png",
            base64: "not-base64!!!"
          }),
        (error: unknown) => hasApiCode(error, AuctionErrorCode.ValidationFailed)
      );
    } finally {
      await fixture.dispose();
    }
  });

  it("rejects images whose bytes do not match contentType", async () => {
    const fixture = await makeUploadFixture();

    try {
      const service = new AdminUploadsService();

      await assert.rejects(
        () =>
          service.uploadItemImage({
            fileName: "item.png",
            contentType: "image/png",
            base64: onePixelGifBase64
          }),
        (error: unknown) => hasApiCode(error, AuctionErrorCode.ValidationFailed)
      );
    } finally {
      await fixture.dispose();
    }
  });
});

async function makeUploadFixture(): Promise<{
  tempDir: string;
  dispose: () => Promise<void>;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "live-auction-upload-"));
  const previousCwd = process.cwd();
  const previousBaseUrl = process.env.PUBLIC_API_BASE_URL;

  process.chdir(tempDir);
  process.env.PUBLIC_API_BASE_URL = "http://uploads.test";

  return {
    tempDir,
    dispose: async () => {
      process.chdir(previousCwd);
      if (previousBaseUrl === undefined) {
        delete process.env.PUBLIC_API_BASE_URL;
      } else {
        process.env.PUBLIC_API_BASE_URL = previousBaseUrl;
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

function hasApiCode(error: unknown, code: AuctionErrorCode): boolean {
  if (!(error instanceof Error) || !("getResponse" in error)) {
    return false;
  }

  const response = (error as { getResponse: () => unknown }).getResponse() as {
    code?: AuctionErrorCode;
  };

  return response.code === code;
}
