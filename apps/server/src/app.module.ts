import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AuctionModule } from "./auction/auction.module";
import { BidModule } from "./bid/bid.module";
import { RedisModule } from "./cache/redis.module";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [PrismaModule, RedisModule, AuctionModule, AdminModule, BidModule, RealtimeModule],
  controllers: [HealthController]
})
export class AppModule {}
