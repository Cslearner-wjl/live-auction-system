import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { HttpStatus, Injectable } from "@nestjs/common";
import { AuctionErrorCode } from "@live-auction/shared";
import { ApiException, validationFailed } from "../common/api-error";
import { resolveUploadStaticRoot } from "../common/upload-paths";

export interface UploadItemImagePayload {
  fileName?: unknown;
  contentType?: unknown;
  base64?: unknown;
}

export interface UploadItemImageDto {
  url: string;
  path: string;
}

const maxImageBytes = 3 * 1024 * 1024;
const allowedContentTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

@Injectable()
export class AdminUploadsService {
  async uploadItemImage(payload: UploadItemImagePayload): Promise<UploadItemImageDto> {
    const contentType = readContentType(payload.contentType);
    const image = readBase64Image(payload.base64);
    const extension = allowedContentTypes.get(contentType) ?? extensionFromFileName(payload.fileName);

    if (image.length > maxImageBytes) {
      throw validationFailed("base64", "image must be at most 3MB");
    }
    assertImageSignature(image, contentType);

    const uploadDir = join(resolveUploadStaticRoot(), "items");
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const relativePath = `/uploads/items/${fileName}`;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, fileName), image);

    return {
      url: `${readPublicBaseUrl()}${relativePath}`,
      path: relativePath
    };
  }
}

function readContentType(value: unknown): string {
  if (typeof value !== "string") {
    throw validationFailed("contentType", "must be a string");
  }

  const normalized = value.trim().toLowerCase();
  if (!allowedContentTypes.has(normalized)) {
    throw validationFailed("contentType", "must be jpeg, png, webp, or gif");
  }

  return normalized;
}

function readBase64Image(value: unknown): Buffer {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationFailed("base64", "must be a non-empty base64 string");
  }

  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw validationFailed("base64", "must be valid base64");
  }

  const image = Buffer.from(normalized, "base64");
  if (image.length === 0 || image.toString("base64") !== normalized) {
    throw validationFailed("base64", "must be valid base64");
  }

  return image;
}

function assertImageSignature(image: Buffer, contentType: string): void {
  const isValid =
    (contentType === "image/jpeg" && image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) ||
    (contentType === "image/png" &&
      image.length >= 8 &&
      image[0] === 0x89 &&
      image[1] === 0x50 &&
      image[2] === 0x4e &&
      image[3] === 0x47 &&
      image[4] === 0x0d &&
      image[5] === 0x0a &&
      image[6] === 0x1a &&
      image[7] === 0x0a) ||
    (contentType === "image/webp" &&
      image.length >= 12 &&
      image.subarray(0, 4).toString("ascii") === "RIFF" &&
      image.subarray(8, 12).toString("ascii") === "WEBP") ||
    (contentType === "image/gif" &&
      image.length >= 6 &&
      (image.subarray(0, 6).toString("ascii") === "GIF87a" ||
        image.subarray(0, 6).toString("ascii") === "GIF89a"));

  if (!isValid) {
    throw validationFailed("base64", "image bytes must match contentType");
  }
}

function extensionFromFileName(value: unknown): string {
  if (typeof value !== "string") {
    return ".jpg";
  }

  const extension = extname(value).toLowerCase();
  return [...allowedContentTypes.values()].includes(extension) ? extension : ".jpg";
}

function readPublicBaseUrl(): string {
  const value =
    process.env.PUBLIC_API_BASE_URL ??
    process.env.SERVER_PUBLIC_URL ??
    `http://localhost:${process.env.SERVER_PORT ?? 3000}`;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    return value.replace(/\/+$/, "");
  } catch {
    throw new ApiException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      AuctionErrorCode.ValidationFailed,
      "服务端 PUBLIC_API_BASE_URL 配置不合法",
      { value }
    );
  }
}
