import { spawn } from "node:child_process";
import net from "node:net";

const DEFAULT_DATABASE_URL = "mysql://auction:change_me@127.0.0.1:3307/live_auction";
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;

process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL = redisUrl;

async function main() {
  const database = tcpEndpointFromUrl(databaseUrl, 3306);
  const redis = tcpEndpointFromUrl(redisUrl, 6379);
  const databaseOpen = await canConnect(database);
  const redisOpen = await canConnect(redis);

  if ((!databaseOpen || !redisOpen) && process.env.PLAYWRIGHT_SKIP_DOCKER !== "1") {
    await run("docker", ["compose", "up", "-d", "mysql", "redis"]);
  }

  await waitForTcp(database, "MySQL", 120_000);
  await waitForTcp(redis, "Redis", 120_000);

  await run("pnpm", ["--filter", "@live-auction/server", "prisma:generate"]);
  await runWithRetry(
    "pnpm",
    [
      "--filter",
      "@live-auction/server",
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      "prisma/schema.prisma"
    ],
    3
  );
  await runWithRetry("pnpm", ["--filter", "@live-auction/server", "prisma:seed"], 3);
}

interface TcpEndpoint {
  host: string;
  port: number;
}

function tcpEndpointFromUrl(value: string, fallbackPort: number): TcpEndpoint {
  const parsed = new URL(value);
  return {
    host: parsed.hostname || "127.0.0.1",
    port: Number(parsed.port || fallbackPort)
  };
}

function canConnect(endpoint: TcpEndpoint): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(endpoint);
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForTcp(
  endpoint: TcpEndpoint,
  label: string,
  timeoutMs: number
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(endpoint)) {
      return;
    }

    await sleep(1000);
  }

  throw new Error(
    `${label} is not reachable at ${endpoint.host}:${endpoint.port}. Start docker compose or set PLAYWRIGHT_SKIP_DOCKER=1 with external services.`
  );
}

async function runWithRetry(
  command: string,
  args: string[],
  attempts: number
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await run(command, args);
      return;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(3000);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", toWindowsCommand(command, args)], {
            cwd: process.cwd(),
            env: process.env,
            stdio: "inherit"
          })
        : spawn(command, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: "inherit"
          });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}`));
    });
  });
}

function toWindowsCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/"/g, '\\"')}"`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
