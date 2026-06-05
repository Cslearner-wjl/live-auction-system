import { defineConfig, devices } from "@playwright/test";

const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:3100";
const adminBaseUrl = process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? "http://localhost:5273";
const mobileBaseUrl = process.env.PLAYWRIGHT_MOBILE_BASE_URL ?? "http://localhost:5274";
const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://auction:change_me@127.0.0.1:3307/live_auction";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const reuseExistingServer = process.env.CI !== "true";
const apiPort = new URL(apiBaseUrl).port || "3100";
const adminPort = new URL(adminBaseUrl).port || "5273";
const mobilePort = new URL(mobileBaseUrl).port || "5274";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI === "true" ? [["list"], ["html"]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm dev:server",
      url: `${apiBaseUrl}/health`,
      timeout: 120_000,
      reuseExistingServer,
      env: {
        ...process.env,
        SERVER_PORT: apiPort,
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        ADMIN_WEB_URL: adminBaseUrl,
        MOBILE_WEB_URL: mobileBaseUrl
      }
    },
    {
      command: `pnpm --filter @live-auction/admin exec vite --host 0.0.0.0 --port ${adminPort}`,
      url: `${adminBaseUrl}/admin/auctions`,
      timeout: 120_000,
      reuseExistingServer,
      env: {
        ...process.env,
        VITE_API_BASE_URL: apiBaseUrl
      }
    },
    {
      command: `pnpm --filter @live-auction/mobile exec vite --host 0.0.0.0 --port ${mobilePort}`,
      url: mobileBaseUrl,
      timeout: 120_000,
      reuseExistingServer,
      env: {
        ...process.env,
        VITE_API_BASE_URL: apiBaseUrl,
        VITE_SOCKET_URL: apiBaseUrl
      }
    }
  ]
});
