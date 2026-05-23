import { HttpException, HttpStatus } from "@nestjs/common";
import { AuctionErrorCode, type ApiErrorResponse } from "@live-auction/shared";

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: AuctionErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(
      {
        code,
        message,
        details
      } satisfies ApiErrorResponse,
      status
    );
  }
}

export function validationFailed(
  field: string,
  reason: string,
  details: Record<string, unknown> = {}
): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, AuctionErrorCode.ValidationFailed, "请求参数不合法", {
    field,
    reason,
    ...details
  });
}

export function notFound(
  code: AuctionErrorCode,
  message: string,
  details: Record<string, unknown>
): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, code, message, details);
}

export function conflict(
  code: AuctionErrorCode,
  message: string,
  details: Record<string, unknown>
): ApiException {
  return new ApiException(HttpStatus.CONFLICT, code, message, details);
}
