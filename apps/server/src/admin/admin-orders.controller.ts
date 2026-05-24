import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { AdminDemoAuthGuard } from "../common/demo-auth.guard";
import { AdminOrdersService } from "./admin-orders.service";

@Controller("admin/orders")
@UseGuards(AdminDemoAuthGuard)
export class AdminOrdersController {
  constructor(
    @Inject(AdminOrdersService)
    private readonly ordersService: AdminOrdersService
  ) {}

  @Get()
  async listOrders(@Query() query: Record<string, unknown>) {
    return this.ordersService.listOrders(query);
  }

  @Get(":orderId")
  async getOrder(@Param("orderId") orderId: string) {
    return this.ordersService.getOrder(orderId);
  }
}
