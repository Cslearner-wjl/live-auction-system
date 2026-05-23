import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  AdminDemoAuthGuard,
  type DemoRequest
} from "../common/demo-auth.guard";
import { AdminItemsService } from "./admin-items.service";
import type { ItemPayload } from "./item.validation";

@Controller("admin/items")
@UseGuards(AdminDemoAuthGuard)
export class AdminItemsController {
  constructor(
    @Inject(AdminItemsService)
    private readonly itemsService: AdminItemsService
  ) {}

  @Post()
  async createItem(@Body() body: ItemPayload, @Req() request: DemoRequest) {
    return this.itemsService.createItem(body, request.demoUser?.userId ?? "");
  }

  @Get()
  async listItems(@Query() query: Record<string, unknown>) {
    return this.itemsService.listItems(query);
  }

  @Get(":itemId")
  async getItem(@Param("itemId") itemId: string) {
    return this.itemsService.getItem(itemId);
  }

  @Patch(":itemId")
  async updateItem(@Param("itemId") itemId: string, @Body() body: ItemPayload) {
    return this.itemsService.updateItem(itemId, body);
  }
}
