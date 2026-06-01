import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  BidderDemoAuthGuard,
  type DemoRequest
} from "../common/demo-auth.guard";
import { UserOrdersService } from "./user-orders.service";

@Controller()
@UseGuards(BidderDemoAuthGuard)
export class UserOrdersController {
  constructor(
    @Inject(UserOrdersService)
    private readonly ordersService: UserOrdersService
  ) {}

  @Get("users/me/auction-history")
  async listAuctionHistory(
    @Query() query: Record<string, unknown>,
    @Req() request: DemoRequest
  ) {
    return this.ordersService.listAuctionHistory(request.demoUser!.userId, query);
  }

  @Get("orders/:orderId")
  async getOrder(
    @Param("orderId") orderId: string,
    @Req() request: DemoRequest
  ) {
    return this.ordersService.getOrder(orderId, request.demoUser!.userId);
  }

  @Post("orders/:orderId/mock-pay")
  @HttpCode(HttpStatus.OK)
  async mockPay(
    @Param("orderId") orderId: string,
    @Req() request: DemoRequest
  ) {
    return this.ordersService.mockPay(orderId, request.demoUser!.userId);
  }
}
