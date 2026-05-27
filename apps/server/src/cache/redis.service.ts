import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;
export type RedisEvalResult = string | number | RedisEvalResult[] | null;

export interface RedisEvalOptions {
  keys: string[];
  arguments: string[];
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
}
