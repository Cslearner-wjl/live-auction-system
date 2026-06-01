import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UserOrdersController } from "./user-orders.controller";
import { UserOrdersService } from "./user-orders.service";

@Module({
  imports: [PrismaModule],
  controllers: [UserOrdersController],
  providers: [UserOrdersService]
})
export class UserOrdersModule {}
