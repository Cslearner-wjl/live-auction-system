# 错误码契约

错误码唯一来源是 `packages/shared/src/error-codes.ts`。API、WebSocket、测试和前端展示不得临时发明未登记错误码。

## 1. 错误响应格式

```json
{
  "code": "BID_AMOUNT_TOO_LOW",
  "message": "出价必须高于当前价",
  "details": {
    "currentPriceFen": 85000,
    "amountFen": 80000
  }
}
```

## 2. 错误码全集

| 错误码 | HTTP 状态码 | WebSocket 是否发送 | 用户文案 | details 建议 |
| --- | --- | --- | --- | --- |
| `AUCTION_NOT_FOUND` | 404 | 否 | 竞拍不存在 | `auctionId` |
| `ITEM_NOT_FOUND` | 404 | 否 | 商品不存在 | `itemId` |
| `ROOM_NOT_FOUND` | 404 | 否 | 直播间不存在 | `roomId` |
| `ORDER_NOT_FOUND` | 404 | 否 | 订单不存在 | `orderId` |
| `AUCTION_NOT_RUNNING` | 409 | 是，`BID_REJECTED` | 当前竞拍未开始 | `auctionId`, `status` |
| `AUCTION_ALREADY_ENDED` | 409 | 是，`BID_REJECTED` | 当前竞拍已结束 | `auctionId`, `status` |
| `AUCTION_CANCELLED` | 409 | 是，`BID_REJECTED` | 当前竞拍已取消 | `auctionId` |
| `BID_AMOUNT_TOO_LOW` | 409 | 是，`BID_REJECTED` | 出价必须高于当前价 | `currentPriceFen`, `amountFen` |
| `BID_INCREMENT_INVALID` | 409 | 是，`BID_REJECTED` | 出价不符合固定加价幅度 | `currentPriceFen`, `amountFen`, `incrementFen` |
| `BID_EXCEEDS_CAP_PRICE` | 409 | 是，`BID_REJECTED` | 出价不能超过封顶价 | `capPriceFen`, `amountFen` |
| `BIDDER_ALREADY_LEADING` | 409 | 是，`BID_REJECTED` | 当前您已是最高价 | `auctionId`, `userId` |
| `DUPLICATE_CLIENT_BID` | 409 | 是，`BID_REJECTED` 或返回原结果 | 请勿重复提交同一出价 | `auctionId`, `clientBidId` |
| `INVALID_AUCTION_TRANSITION` | 409 | 否 | 当前竞拍状态不允许该操作 | `from`, `to` |
| `RULE_CANNOT_BE_CHANGED_AFTER_START` | 409 | 否 | 竞拍开始后不能修改规则 | `auctionId`, `status` |
| `ORDER_ALREADY_CREATED` | 409 | 否 | 该竞拍已生成订单 | `auctionId`, `orderId` |
| `ORDER_ALREADY_PAID` | 409 | 否 | 订单已支付 | `orderId`, `paidAt` |
| `UNAUTHORIZED` | 401 | 否 | 请提供演示身份 | `missingHeaders` |
| `FORBIDDEN` | 403 | 否 | 当前身份无权执行该操作 | `requiredRole`, `actualRole` |
| `VALIDATION_FAILED` | 400 | 否 | 请求参数不合法 | `field`, `reason` |

## 3. 实现规则

- Controller 只负责把业务异常映射为统一错误响应。
- Service 层抛出的业务错误必须使用本表错误码。
- WebSocket `BID_REJECTED` 的 `code` 必须来自本表。
- 不向客户端返回堆栈信息、SQL 错误、Redis 原始错误或完整授权头。
- 新增错误码必须同时更新本文档和 `packages/shared/src/error-codes.ts`。
