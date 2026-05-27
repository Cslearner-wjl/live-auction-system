import { Module } from "@nestjs/common";
import { AuctionModule } from "../auction/auction.module";
import { RedisModule } from "../cache/redis.module";
import { PrismaModule } from "../prisma/prisma.module";
import { BidController } from "./bid.controller";
import { RedisBidAtomicStore } from "./bid-redis.store";
import { BidService } from "./bid.service";

@Module({
  imports: [PrismaModule, RedisModule, AuctionModule],
  controllers: [BidController],
  providers: [BidService, RedisBidAtomicStore],
  exports: [BidService]
})
export class BidModule {}
