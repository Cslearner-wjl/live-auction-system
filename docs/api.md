# API 契约

本文档定义直播竞拍系统的 REST API 契约。当前 Day 3 已实现管理端商品与竞拍规则配置接口；用户端出价、订单支付、WebSocket 相关接口仍按目标契约记录，后续实现代码必须向本文档收敛。

## 1. 通用约定

### 1.1 基础信息

- Base URL：`http://localhost:3000`
- Content-Type：`application/json; charset=utf-8`
- 金额：全部使用整数分，字段名必须以 `Fen` 结尾。
- 时间：全部使用 ISO 8601 字符串，例如 `2026-06-01T10:00:00.000Z`。
- ID：字符串，演示数据使用 `user_1`、`room_1`、`auction_1` 这类可读 ID。
- 未实现接口不得返回伪成功；可以返回 `501`，但一旦实现必须遵守本文档。

### 1.2 Demo 鉴权

MVP 不实现完整登录鉴权，所有非健康检查接口使用 demo header 构造身份上下文。

| Header | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `X-Demo-User-Id` | string | 是 | `user_1` | 当前请求用户 ID |
| `X-Demo-Role` | `admin` 或 `bidder` | 是 | `bidder` | 当前请求角色 |

权限边界：

- `/admin/*` 只允许 `X-Demo-Role: admin`。
- 用户端接口允许 `X-Demo-Role: bidder`。
- 管理端不得代替用户出价。
- 用户端不得调用管理端创建、启动、取消竞拍接口。

### 1.3 通用错误格式

```json
{
  "code": "AUCTION_ALREADY_ENDED",
  "message": "当前竞拍已结束",
  "details": {}
}
```

通用错误示例：

```json
{
  "code": "VALIDATION_FAILED",
  "message": "请求参数不合法",
  "details": {
    "field": "incrementFen",
    "reason": "must be greater than 0"
  }
}
```

```json
{
  "code": "AUCTION_NOT_FOUND",
  "message": "竞拍不存在",
  "details": {
    "auctionId": "auction_missing"
  }
}
```

```json
{
  "code": "RULE_CANNOT_BE_CHANGED_AFTER_START",
  "message": "竞拍开始后不能修改规则",
  "details": {
    "auctionId": "auction_1",
    "status": "RUNNING"
  }
}
```

### 1.4 通用状态码

| 状态码 | 使用场景 |
| --- | --- |
| `200` | 查询、启动、取消、出价、模拟支付成功 |
| `201` | 创建商品、创建竞拍成功 |
| `400` | DTO 校验失败、业务输入不合法 |
| `401` | 缺少 demo 身份 header |
| `403` | 角色无权访问接口 |
| `404` | 房间、商品、竞拍、订单不存在 |
| `409` | 状态冲突、幂等冲突、重复订单、竞拍已结束 |
| `501` | 目标契约已定义但接口尚未实现 |

### 1.5 通用分页

列表接口统一使用查询参数：

| 参数 | 类型 | 必填 | 默认值 | 规则 |
| --- | --- | --- | --- | --- |
| `page` | integer | 否 | `1` | 大于等于 `1` |
| `pageSize` | integer | 否 | `20` | `1` 到 `100` |

列表响应格式：

```json
{
  "items": [],
  "page": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### 1.6 核心 DTO

#### AuctionStatus

```txt
DRAFT
SCHEDULED
RUNNING
ENDED_SOLD
ENDED_UNSOLD
CANCELLED
```

#### Item DTO

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `id` | string | 响应必填 | 商品 ID |
| `name` | string | 是 | 1 到 80 字符 |
| `imageUrl` | string | 是 | URL 字符串 |
| `description` | string | 是 | 1 到 2000 字符 |
| `sellingPoints` | string[] | 否 | 每项 1 到 30 字符，最多 10 项 |
| `createdAt` | string | 响应必填 | ISO 时间 |
| `updatedAt` | string | 响应必填 | ISO 时间 |

#### Auction Rule DTO

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `startPriceFen` | integer | 是 | 大于等于 `0` |
| `incrementFen` | integer | 是 | 大于 `0` |
| `durationSeconds` | integer | 是 | 大于 `0` |
| `capPriceFen` | integer | 是 | 大于 `startPriceFen` |
| `antiSnipingWindowSeconds` | integer | 是 | 大于等于 `0` |
| `extensionSeconds` | integer | 是 | 大于等于 `0`；启用延时时建议 10 到 30 |
| `maxExtensionCount` | integer | 否 | 缺省为 `0`，表示不延时或按实现配置 |

#### Auction DTO

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 竞拍 ID |
| `roomId` | string | 是 | 直播间 ID |
| `itemId` | string | 是 | 商品 ID |
| `status` | AuctionStatus | 是 | 当前状态 |
| `startPriceFen` | integer | 是 | 起拍价 |
| `currentPriceFen` | integer | 是 | 当前价 |
| `incrementFen` | integer | 是 | 固定加价幅度 |
| `capPriceFen` | integer | 是 | 封顶价 |
| `startTime` | string 或 null | 是 | 开始时间 |
| `endTime` | string 或 null | 是 | 结束时间 |
| `extendedCount` | integer | 是 | 已延时次数 |
| `highestBidderId` | string 或 null | 是 | 当前最高出价人 |
| `bidCount` | integer | 是 | 有效出价次数 |
| `version` | integer | 是 | 状态版本 |

## 2. Health

### GET /health

无需 demo header。

200：

```json
{
  "status": "ok",
  "service": "live-auction-server",
  "timestamp": "2026-05-21T00:00:00.000Z"
}
```

curl：

```bash
curl http://localhost:3000/health
```

## 3. 管理后台 API

所有管理端接口需要：

```txt
X-Demo-User-Id: admin_1
X-Demo-Role: admin
```

Day 3 已实现：

- `POST /admin/items`
- `GET /admin/items`
- `GET /admin/items/:itemId`
- `PATCH /admin/items/:itemId`
- `POST /admin/auctions`
- `GET /admin/auctions`
- `GET /admin/auctions/:auctionId`
- `PATCH /admin/auctions/:auctionId/rules`
- `POST /admin/auctions/:auctionId/start`
- `POST /admin/auctions/:auctionId/cancel`

Day 3 尚未实现订单和 AI 卖点接口；订单会在结算流程落地后接入。

### POST /admin/items

创建竞拍商品。

Request DTO：

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1 到 80 字符 |
| `imageUrl` | string | 是 | URL |
| `description` | string | 是 | 1 到 2000 字符 |
| `sellingPoints` | string[] | 否 | 最多 10 项 |

201：

```json
{
  "id": "item_1",
  "name": "翡翠手镯",
  "imageUrl": "https://example.com/item.png",
  "description": "天然翡翠手镯",
  "sellingPoints": ["支持鉴定", "包邮"],
  "createdAt": "2026-06-01T09:00:00.000Z",
  "updatedAt": "2026-06-01T09:00:00.000Z"
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`。

curl：

```bash
curl -X POST http://localhost:3000/admin/items \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin" \
  -d "{\"name\":\"翡翠手镯\",\"imageUrl\":\"https://example.com/item.png\",\"description\":\"天然翡翠手镯\",\"sellingPoints\":[\"支持鉴定\",\"包邮\"]}"
```

### GET /admin/items

查询商品列表，支持分页。

Query：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | integer | 否 | 页码 |
| `pageSize` | integer | 否 | 每页数量 |

200：

```json
{
  "items": [
    {
      "id": "item_1",
      "name": "翡翠手镯",
      "imageUrl": "https://example.com/item.png",
      "description": "天然翡翠手镯",
      "sellingPoints": ["支持鉴定", "包邮"],
      "createdAt": "2026-06-01T09:00:00.000Z",
      "updatedAt": "2026-06-01T09:00:00.000Z"
    }
  ],
  "page": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`。

curl：

```bash
curl "http://localhost:3000/admin/items?page=1&pageSize=20" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin"
```

### GET /admin/items/:itemId

查询商品详情。

Path：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `itemId` | string | 是 | 商品 ID |

200：同 `POST /admin/items` 响应。

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 ITEM_NOT_FOUND`。

curl：

```bash
curl http://localhost:3000/admin/items/item_1 \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin"
```

### PATCH /admin/items/:itemId

修改商品信息。不得在这里修改竞拍规则。

Request DTO：

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `name` | string | 否 | 1 到 80 字符 |
| `imageUrl` | string | 否 | URL |
| `description` | string | 否 | 1 到 2000 字符 |
| `sellingPoints` | string[] | 否 | 最多 10 项 |

200：返回更新后的 Item DTO。

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 ITEM_NOT_FOUND`。

curl：

```bash
curl -X PATCH http://localhost:3000/admin/items/item_1 \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin" \
  -d "{\"sellingPoints\":[\"支持鉴定\",\"顺丰包邮\"]}"
```

### POST /admin/auctions

创建竞拍会话和规则。新竞拍初始状态为 `SCHEDULED`，未启动前允许修改规则。

Request DTO：

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `roomId` | string | 是 | 房间必须存在 |
| `itemId` | string | 是 | 商品必须存在 |
| `startPriceFen` | integer | 是 | 大于等于 `0` |
| `incrementFen` | integer | 是 | 大于 `0` |
| `durationSeconds` | integer | 是 | 大于 `0` |
| `capPriceFen` | integer | 是 | 大于 `startPriceFen` |
| `antiSnipingWindowSeconds` | integer | 是 | 大于等于 `0` |
| `extensionSeconds` | integer | 是 | 大于等于 `0` |
| `maxExtensionCount` | integer | 否 | 大于等于 `0` |

201：

```json
{
  "id": "auction_1",
  "roomId": "room_1",
  "itemId": "item_1",
  "status": "SCHEDULED",
  "startPriceFen": 0,
  "currentPriceFen": 0,
  "incrementFen": 1000,
  "capPriceFen": 100000,
  "startTime": null,
  "endTime": null,
  "extendedCount": 0,
  "highestBidderId": null,
  "bidCount": 0,
  "version": 1
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 ROOM_NOT_FOUND`、`404 ITEM_NOT_FOUND`。

curl：

```bash
curl -X POST http://localhost:3000/admin/auctions \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin" \
  -d "{\"roomId\":\"room_1\",\"itemId\":\"item_1\",\"startPriceFen\":0,\"incrementFen\":1000,\"durationSeconds\":300,\"capPriceFen\":100000,\"antiSnipingWindowSeconds\":10,\"extensionSeconds\":15,\"maxExtensionCount\":3}"
```

### GET /admin/auctions

查询竞拍列表。

Query：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | AuctionStatus | 否 | 状态筛选 |
| `page` | integer | 否 | 页码 |
| `pageSize` | integer | 否 | 每页数量 |

200：

```json
{
  "items": [
    {
      "id": "auction_1",
      "roomId": "room_1",
      "itemId": "item_1",
      "itemName": "翡翠手镯",
      "itemImageUrl": "https://example.com/item.png",
      "status": "RUNNING",
      "startPriceFen": 0,
      "incrementFen": 1000,
      "capPriceFen": 100000,
      "currentPriceFen": 90000,
      "bidCount": 14,
      "endTime": "2026-06-01T10:00:00.000Z"
    }
  ],
  "page": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`。

curl：

```bash
curl "http://localhost:3000/admin/auctions?status=RUNNING&page=1&pageSize=20" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin"
```

### GET /admin/auctions/:auctionId

查询竞拍详情。

200：返回 Auction DTO，并包含商品和规则摘要。

```json
{
  "id": "auction_1",
  "roomId": "room_1",
  "itemId": "item_1",
  "status": "RUNNING",
  "startPriceFen": 0,
  "currentPriceFen": 90000,
  "incrementFen": 1000,
  "capPriceFen": 100000,
  "startTime": "2026-06-01T09:55:00.000Z",
  "endTime": "2026-06-01T10:00:00.000Z",
  "extendedCount": 1,
  "highestBidderId": "user_1",
  "bidCount": 14,
  "version": 18,
  "item": {
    "id": "item_1",
    "name": "翡翠手镯",
    "imageUrl": "https://example.com/item.png"
  },
  "rule": {
    "startPriceFen": 0,
    "incrementFen": 1000,
    "durationSeconds": 300,
    "capPriceFen": 100000,
    "antiSnipingWindowSeconds": 10,
    "extensionSeconds": 15,
    "maxExtensionCount": 3
  }
}
```

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 AUCTION_NOT_FOUND`。

curl：

```bash
curl http://localhost:3000/admin/auctions/auction_1 \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin"
```

### PATCH /admin/auctions/:auctionId/rules

修改竞拍规则。仅允许竞拍开始前修改，`RUNNING`、`ENDED_*`、`CANCELLED` 均返回冲突。

Request DTO：同 Auction Rule DTO，字段可部分传入。

200：返回更新后的 Auction DTO。

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 AUCTION_NOT_FOUND`、`409 RULE_CANNOT_BE_CHANGED_AFTER_START`。

curl：

```bash
curl -X PATCH http://localhost:3000/admin/auctions/auction_1/rules \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin" \
  -d "{\"incrementFen\":2000,\"extensionSeconds\":20}"
```

### POST /admin/auctions/:auctionId/start

启动竞拍。状态必须从 `SCHEDULED` 流转到 `RUNNING`。

200：返回启动后的 Auction DTO。

Day 3 只做 DB 状态更新和 `startTime` / `endTime` 写入；Redis 热状态初始化、结束 timer、事件 outbox 和 WebSocket 广播在 Day 4 以后实现。

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 AUCTION_NOT_FOUND`、`409 INVALID_AUCTION_TRANSITION`。

curl：

```bash
curl -X POST http://localhost:3000/admin/auctions/auction_1/start \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin"
```

### POST /admin/auctions/:auctionId/cancel

取消异常竞拍。允许 `SCHEDULED` 或 `RUNNING` 取消。

Request DTO：

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `reason` | string | 是 | 1 到 200 字符 |

200：

```json
{
  "auctionId": "auction_1",
  "status": "CANCELLED",
  "reason": "主播确认商品状态异常",
  "cancelledAt": "2026-06-01T09:58:00.000Z"
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 AUCTION_NOT_FOUND`、`409 INVALID_AUCTION_TRANSITION`。

Day 3 只做 DB 状态取消和稳定响应；取消事件广播在 WebSocket 网关落地后实现。

curl：

```bash
curl -X POST http://localhost:3000/admin/auctions/auction_1/cancel \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin" \
  -d "{\"reason\":\"主播确认商品状态异常\"}"
```

### GET /admin/orders

查询订单列表。

Query：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | string | 否 | `PENDING_PAYMENT`、`PAID`、`CLOSED` |
| `page` | integer | 否 | 页码 |
| `pageSize` | integer | 否 | 每页数量 |

200：

```json
{
  "items": [
    {
      "id": "order_1",
      "auctionId": "auction_1",
      "itemId": "item_1",
      "buyerId": "user_1",
      "amountFen": 100000,
      "status": "PENDING_PAYMENT",
      "createdAt": "2026-06-01T10:00:00.000Z",
      "updatedAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "page": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`。

curl：

```bash
curl "http://localhost:3000/admin/orders?page=1&pageSize=20" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin"
```

### GET /admin/orders/:orderId

查询订单详情。

200：返回订单 DTO。

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 ORDER_NOT_FOUND`。

curl：

```bash
curl http://localhost:3000/admin/orders/order_1 \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin"
```

### POST /admin/ai/generate-selling-points

生成商品卖点和直播话术。无 AI API Key 时返回确定性 mock 内容。

Request DTO：

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `itemName` | string | 是 | 1 到 80 字符 |
| `description` | string | 是 | 1 到 2000 字符 |
| `startPriceFen` | integer | 是 | 大于等于 `0` |
| `targetAudience` | string | 否 | 最多 80 字符 |

200：

```json
{
  "tags": ["支持鉴定", "收藏级"],
  "script": "这款商品适合关注品质和收藏价值的用户。",
  "auctionAtmosphereCopy": "喜欢的朋友可以先出价锁定领先位置。",
  "source": "mock"
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`。

curl：

```bash
curl -X POST http://localhost:3000/admin/ai/generate-selling-points \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: admin_1" \
  -H "X-Demo-Role: admin" \
  -d "{\"itemName\":\"翡翠手镯\",\"description\":\"天然翡翠手镯\",\"startPriceFen\":0,\"targetAudience\":\"珠宝收藏用户\"}"
```

## 4. 用户端 API

所有用户端接口需要：

```txt
X-Demo-User-Id: user_1
X-Demo-Role: bidder
```

### GET /rooms/:roomId/auctions

查询直播间当前可见竞拍。

200：

```json
{
  "items": [
    {
      "auctionId": "auction_1",
      "roomId": "room_1",
      "itemId": "item_1",
      "itemName": "翡翠手镯",
      "itemImageUrl": "https://example.com/item.png",
      "status": "RUNNING",
      "currentPriceFen": 85000,
      "startPriceFen": 0,
      "nextBidAmountFen": 90000,
      "bidCount": 13,
      "participantCount": 100,
      "endTime": "2026-06-01T10:00:00.000Z",
      "serverTime": "2026-06-01T09:59:51.000Z"
    }
  ]
}
```

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 ROOM_NOT_FOUND`。

curl：

```bash
curl http://localhost:3000/rooms/room_1/auctions \
  -H "X-Demo-User-Id: user_1" \
  -H "X-Demo-Role: bidder"
```

### GET /auctions/:auctionId

查询竞拍基础信息。

200：

```json
{
  "auctionId": "auction_1",
  "roomId": "room_1",
  "item": {
    "id": "item_1",
    "name": "翡翠手镯",
    "imageUrl": "https://example.com/item.png",
    "description": "天然翡翠手镯",
    "sellingPoints": ["支持鉴定", "包邮"]
  },
  "status": "RUNNING",
  "startPriceFen": 0,
  "currentPriceFen": 85000,
  "incrementFen": 5000,
  "capPriceFen": 100000,
  "endTime": "2026-06-01T10:00:00.000Z",
  "serverTime": "2026-06-01T09:59:51.000Z"
}
```

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 AUCTION_NOT_FOUND`。

curl：

```bash
curl http://localhost:3000/auctions/auction_1 \
  -H "X-Demo-User-Id: user_1" \
  -H "X-Demo-Role: bidder"
```

### GET /auctions/:auctionId/snapshot

查询竞拍快照，用于首次加载和重连恢复。客户端必须以快照为准重建 UI。

200：

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
  "serverSeq": 17,
  "leaderboard": []
}
```

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 AUCTION_NOT_FOUND`。

curl：

```bash
curl http://localhost:3000/auctions/auction_1/snapshot \
  -H "X-Demo-User-Id: user_1" \
  -H "X-Demo-Role: bidder"
```

### POST /auctions/:auctionId/bids

提交出价。

Request DTO：

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `amountFen` | integer | 是 | 大于当前价，不超过封顶价，符合固定加价幅度 |
| `clientBidId` | string | 是 | 同一竞拍下唯一，用于幂等 |

200：

```json
{
  "accepted": true,
  "auctionId": "auction_1",
  "bidId": "bid_1",
  "amountFen": 90000,
  "currentPriceFen": 90000,
  "highestBidderId": "user_1",
  "serverSeq": 18,
  "extended": false,
  "ended": false
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 AUCTION_NOT_FOUND`、`409 AUCTION_NOT_RUNNING`、`409 AUCTION_ALREADY_ENDED`、`409 AUCTION_CANCELLED`、`409 BID_AMOUNT_TOO_LOW`、`409 BID_INCREMENT_INVALID`、`409 BID_EXCEEDS_CAP_PRICE`、`409 BIDDER_ALREADY_LEADING`、`409 DUPLICATE_CLIENT_BID`。

curl：

```bash
curl -X POST http://localhost:3000/auctions/auction_1/bids \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: user_1" \
  -H "X-Demo-Role: bidder" \
  -d "{\"amountFen\":90000,\"clientBidId\":\"demo-client-bid-001\"}"
```

### GET /users/me/auction-history

查询当前用户竞拍历史。

200：

```json
{
  "items": [
    {
      "auctionId": "auction_1",
      "itemName": "翡翠手镯",
      "myHighestBidFen": 90000,
      "finalPriceFen": 100000,
      "status": "ENDED_SOLD",
      "won": false,
      "endedAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "page": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

错误：`400 VALIDATION_FAILED`、`401 UNAUTHORIZED`、`403 FORBIDDEN`。

curl：

```bash
curl "http://localhost:3000/users/me/auction-history?page=1&pageSize=20" \
  -H "X-Demo-User-Id: user_1" \
  -H "X-Demo-Role: bidder"
```

### GET /orders/:orderId

查询当前用户可见订单详情。竞拍赢家只能查看自己的订单。

200：

```json
{
  "id": "order_1",
  "auctionId": "auction_1",
  "itemId": "item_1",
  "buyerId": "user_1",
  "amountFen": 100000,
  "status": "PENDING_PAYMENT",
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-01T10:00:00.000Z"
}
```

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 ORDER_NOT_FOUND`。

curl：

```bash
curl http://localhost:3000/orders/order_1 \
  -H "X-Demo-User-Id: user_1" \
  -H "X-Demo-Role: bidder"
```

### POST /orders/:orderId/mock-pay

模拟支付。仅订单买家可调用。真实支付不在 MVP 范围内。

200：

```json
{
  "orderId": "order_1",
  "status": "PAID",
  "paidAt": "2026-06-01T10:05:00.000Z"
}
```

错误：`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 ORDER_NOT_FOUND`、`409 ORDER_ALREADY_PAID`。

curl：

```bash
curl -X POST http://localhost:3000/orders/order_1/mock-pay \
  -H "X-Demo-User-Id: user_1" \
  -H "X-Demo-Role: bidder"
```

## 5. 错误码来源

错误码唯一来源是 `packages/shared/src/error-codes.ts`，完整表见 `docs/error-codes.md`。API 实现不得临时返回未登记错误码。
