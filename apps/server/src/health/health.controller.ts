import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "live-auction-server",
      timestamp: new Date().toISOString()
    };
  }
}
