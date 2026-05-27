import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable
} from "@nestjs/common";
import { AuctionErrorCode } from "@live-auction/shared";
import { ApiException } from "./api-error";

export interface DemoUserContext {
  userId: string;
  role: "admin" | "bidder";
}

export interface DemoRequest {
  headers: Record<string, string | string[] | undefined>;
  demoUser?: DemoUserContext;
}

@Injectable()
export class AdminDemoAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<DemoRequest>();
    const user = readDemoUser(request);

    if (user.role !== "admin") {
      throw new ApiException(HttpStatus.FORBIDDEN, AuctionErrorCode.Forbidden, "当前身份无权访问管理端接口", {
        role: user.role
      });
    }

    request.demoUser = user;

    return true;
  }
}

@Injectable()
export class BidderDemoAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<DemoRequest>();
    const user = readDemoUser(request);

    if (user.role !== "bidder") {
      throw new ApiException(HttpStatus.FORBIDDEN, AuctionErrorCode.Forbidden, "当前身份无权访问用户端接口", {
        role: user.role
      });
    }

    request.demoUser = user;

    return true;
  }
}

function readDemoUser(request: DemoRequest): DemoUserContext {
  const userId = readSingleHeader(request.headers["x-demo-user-id"]);
  const role = readSingleHeader(request.headers["x-demo-role"]);

  if (!userId || !role) {
    throw new ApiException(HttpStatus.UNAUTHORIZED, AuctionErrorCode.Unauthorized, "缺少 demo 身份 header", {});
  }

  if (role !== "admin" && role !== "bidder") {
    throw new ApiException(HttpStatus.FORBIDDEN, AuctionErrorCode.Forbidden, "未知 demo 身份角色", {
      role
    });
  }

  return {
    userId,
    role
  };
}

function readSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }

  return value?.trim();
}
