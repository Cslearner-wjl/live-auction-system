import { Controller, Get, Inject } from "@nestjs/common";
import { RedisService } from "../cache/redis.service";
import { PrismaService } from "../prisma/prisma.service";

type CheckStatus = "ok" | "error";

interface DependencyCheck {
  status: CheckStatus;
  latencyMs: number;
  message?: string;
}

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisService)
    private readonly redis: RedisService
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis()
    ]);
    const status =
      database.status === "ok" && redis.status === "ok" ? "ok" : "degraded";

    return {
      status,
      service: "live-auction-server",
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis
      }
    };
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    return this.measure(async () => {
      await this.prisma.checkConnection();
    });
  }

  private async checkRedis(): Promise<DependencyCheck> {
    return this.measure(async () => {
      await this.redis.ping();
    });
  }

  private async measure(check: () => Promise<void>): Promise<DependencyCheck> {
    const startedAt = Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        check(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Dependency check timed out")),
            2000
          );
        })
      ]);

      return {
        status: "ok",
        latencyMs: Date.now() - startedAt
      };
    } catch (error: unknown) {
      return {
        status: "error",
        latencyMs: Date.now() - startedAt,
        message: this.toSafeErrorMessage(error)
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private toSafeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.name;
    }

    return "Dependency check failed";
  }
}
