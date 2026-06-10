import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AiModule } from "./ai/ai.module";
import { AuctionModule } from "./auction/auction.module";
import { BidModule } from "./bid/bid.module";
import { RedisModule } from "./cache/redis.module";
import { HealthController } from "./health/health.controller";
import { UserOrdersModule } from "./order/user-orders.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuctionModule,
    AiModule,
    AdminModule,
    BidModule,
    RealtimeModule,
    UserOrdersModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
