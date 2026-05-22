import { Module } from "@nestjs/common";
import { RedisModule } from "./cache/redis.module";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController]
})
export class AppModule {}
