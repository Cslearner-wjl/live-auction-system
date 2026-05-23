import { Module } from "@nestjs/common";
import { AuctionModule } from "../auction/auction.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminAuctionsController } from "./admin-auctions.controller";
import { AdminAuctionsService } from "./admin-auctions.service";
import { AdminItemsController } from "./admin-items.controller";
import { AdminItemsService } from "./admin-items.service";

@Module({
  imports: [PrismaModule, AuctionModule],
  controllers: [AdminItemsController, AdminAuctionsController],
  providers: [AdminItemsService, AdminAuctionsService]
})
export class AdminModule {}
