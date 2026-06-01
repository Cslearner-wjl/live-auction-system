import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;
export type RedisEvalResult = string | number | RedisEvalResult[] | null;

export interface RedisEvalOptions {
  keys: string[];
  arguments: string[];
}

export interface RedisLockOptions {
  key: string;
  ttlMs: number;
  waitTimeoutMs: number;
  retryDelayMs: number;
}

type LockTimer = ReturnType<typeof setInterval> & {
  unref?: () => void;
};

export class RedisLockTimeoutError extends Error {
  constructor(readonly key: string, readonly waitTimeoutMs: number) {
    super(`Timed out waiting for Redis lock ${key}`);
    this.name = "RedisLockTimeoutError";
  }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: RedisClient;
  private connectPromise?: Promise<RedisClient>;

  async ping(): Promise<string> {
    const client = await this.getClient();
    return client.ping();
  }

  async eval(script: string, options: RedisEvalOptions): Promise<RedisEvalResult> {
    const client = await this.getClient();
    return client.eval(script, options) as Promise<RedisEvalResult>;
  }

  async get(key: string): Promise<string | null> {
    const client = await this.getClient();
    return client.get(key);
  }

  async hGet(key: string, field: string): Promise<string | null> {
    const client = await this.getClient();
    return client.hGet(key, field);
  }

  async zCard(key: string): Promise<number> {
    const client = await this.getClient();
    return client.zCard(key);
  }

  async withLock<T>(
    options: RedisLockOptions,
    operation: () => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    const token = randomUUID();
    const deadline = Date.now() + options.waitTimeoutMs;

    while (true) {
      const acquired = await client.set(options.key, token, {
        NX: true,
        PX: options.ttlMs
      });

      if (acquired === "OK") {
        break;
      }

      if (Date.now() >= deadline) {
        throw new RedisLockTimeoutError(options.key, options.waitTimeoutMs);
      }

      await delay(options.retryDelayMs);
    }

    const timer = this.startLockExtender(client, options, token);

    try {
      return await operation();
    } finally {
      clearInterval(timer);
      await this.releaseLock(client, options.key, token);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private async getClient(): Promise<RedisClient> {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const client = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: false
      }
    });

    client.on("error", (error) => {
      this.logger.error(this.toSafeErrorMessage(error));
    });

    this.client = client;
    this.connectPromise = client
      .connect()
      .then(() => client)
      .catch((error: unknown) => {
        this.connectPromise = undefined;
        this.client = undefined;
        throw error;
      });

    return this.connectPromise;
  }

  private toSafeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.name;
    }

    return "Redis connection error";
  }

  private startLockExtender(
    client: RedisClient,
    options: RedisLockOptions,
    token: string
  ): LockTimer {
    const intervalMs = Math.max(1_000, Math.floor(options.ttlMs / 3));
    const timer = setInterval(() => {
      void client
        .eval(EXTEND_LOCK_SCRIPT, {
          keys: [options.key],
          arguments: [token, String(options.ttlMs)]
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to extend Redis lock ${options.key}: ${this.toSafeErrorMessage(error)}`
          );
        });
    }, intervalMs) as LockTimer;

    timer.unref?.();
    return timer;
  }

  private async releaseLock(
    client: RedisClient,
    key: string,
    token: string
  ): Promise<void> {
    try {
      await client.eval(RELEASE_LOCK_SCRIPT, {
        keys: [key],
        arguments: [token]
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to release Redis lock ${key}: ${this.toSafeErrorMessage(error)}`
      );
    }
  }
}

const EXTEND_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[2]))
end
return 0
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;
