import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { AdminDemoAuthGuard } from "../common/demo-auth.guard";
import { AdminUploadsService, type UploadItemImagePayload } from "./admin-uploads.service";

@Controller("admin/uploads")
@UseGuards(AdminDemoAuthGuard)
export class AdminUploadsController {
  constructor(
    @Inject(AdminUploadsService)
    private readonly uploadsService: AdminUploadsService
  ) {}

  @Post("item-image")
  @HttpCode(HttpStatus.OK)
  async uploadItemImage(@Body() body: UploadItemImagePayload) {
    return this.uploadsService.uploadItemImage(body);
  }
}
