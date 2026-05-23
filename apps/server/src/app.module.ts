import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AuctionModule } from "./auction/auction.module";
import { RedisModule } from "./cache/redis.module";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule, RedisModule, AuctionModule, AdminModule],
  controllers: [HealthController]
})
export class AppModule {}
