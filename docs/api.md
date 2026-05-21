# API 契约草案

本文档是 Day 1 API 初稿，描述目标接口和数据约束。接口尚未全部实现，后续开发时必须保持文档与代码同步。

## 1. 通用约定

- 所有金额字段使用整数分，并以 `Fen` 结尾。
- 时间字段使用 ISO 8601 字符串。
- 错误响应格式统一。
- 客户端身份 Day 1 暂不实现，后续可用 demo user header 或 mock auth。

## 2. 错误格式

```json
{
  "code": "AUCTION_ALREADY_ENDED",
  "message": "当前竞拍已结束",
  "details": {}
}
```

## 3. 健康检查

### GET /health

响应：

```json
{
  "status": "ok",
  "service": "live-auction-server",
  "timestamp": "2026-05-21T00:00:00.000Z"
}
```

## 4. 管理后台 API

### POST /admin/items

创建竞拍商品。

请求草案：

```json
{
  "name": "翡翠手镯",
  "imageUrl": "https://example.com/item.png",
  "description": "天然翡翠手镯",
  "sellingPoints": ["支持鉴定", "包邮"]
}
```

### GET /admin/items

查询商品列表。

### GET /admin/items/:itemId

查询商品详情。

### PATCH /admin/items/:itemId

修改商品信息。不得在这里修改已开始竞拍的核心规则。

### POST /admin/auctions

创建竞拍会话和规则。

请求草案：

```json
{
  "roomId": "room_1",
  "itemId": "item_1",
  "startPriceFen": 0,
  "incrementFen": 1000,
  "durationSeconds": 300,
  "capPriceFen": 100000,
  "antiSnipingWindowSeconds": 10,
  "extensionSeconds": 15,
  "maxExtensionCount": 3
}
```

### GET /admin/auctions

查询竞拍列表，支持按 `status` 筛选。

### GET /admin/auctions/:auctionId

查询竞拍详情。

### PATCH /admin/auctions/:auctionId/rules

修改竞拍规则。仅允许在竞拍开始前修改。

### POST /admin/auctions/:auctionId/start

启动竞拍。

### POST /admin/auctions/:auctionId/cancel

取消异常竞拍。

请求草案：

```json
{
  "reason": "主播确认商品状态异常"
}
```

### GET /admin/orders

查询订单列表。

### GET /admin/orders/:orderId

查询订单详情。

### POST /admin/ai/generate-selling-points

可选 AI 功能。无 API Key 时必须返回 mock 内容。

请求草案：

```json
{
  "itemName": "翡翠手镯",
  "description": "天然翡翠手镯",
  "startPriceFen": 0,
  "targetAudience": "珠宝收藏用户"
}
```

响应草案：

```json
{
  "tags": ["支持鉴定", "收藏级"],
  "script": "这款商品适合关注品质和收藏价值的用户。",
  "auctionAtmosphereCopy": "喜欢的朋友可以先出价锁定领先位置。"
}
```

## 5. 用户端 API

### GET /rooms/:roomId/auctions

查询直播间当前可见竞拍。

### GET /auctions/:auctionId

查询竞拍基础信息。

### GET /auctions/:auctionId/snapshot

查询竞拍快照，用于页面加载和重连恢复。

响应草案：

```json
{
  "auctionId": "auction_1",
  "status": "RUNNING",
  "currentPriceFen": 85000,
  "nextBidAmountFen": 90000,
  "highestBidderMaskedName": "张**",
  "myBidAmountFen": null,
  "myRank": null,
  "bidCount": 13,
  "participantCount": 100,
  "endTime": "2026-06-01T10:00:00.000Z",
  "serverTime": "2026-06-01T09:59:51.000Z",
  "leaderboard": []
}
```

### POST /auctions/:auctionId/bids

提交出价。

请求：

```json
{
  "amountFen": 90000,
  "clientBidId": "uuid-from-client"
}
```

成功响应草案：

```json
{
  "accepted": true,
  "auctionId": "auction_1",
  "amountFen": 90000,
  "currentPriceFen": 90000,
  "highestBidderId": "user_1",
  "extended": false,
  "ended": false
}
```

失败时返回统一错误格式。

### GET /users/me/auction-history

查询当前用户竞拍历史。

### GET /orders/:orderId

查询订单详情。

### POST /orders/:orderId/mock-pay

模拟支付。

## 6. 后续补充

Day 2 之后需要补充：

- DTO 字段校验。
- 分页参数。
- demo 身份传递方式。
- 具体错误码清单。
- E2E 示例请求。
