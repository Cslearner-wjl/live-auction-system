# WebSocket 事件契约

本文档定义直播竞拍系统的目标 WebSocket 契约。事件名必须与 `packages/shared/src/websocket-events.ts` 保持一致。当前仓库不代表 Gateway 已经实现。

## 1. 房间约定

```txt
room:{roomId}
auction:{auctionId}
user:{userId}
```

规则：

- 直播间公共事件发送到 `room:{roomId}`。
- 竞拍事件发送到 `auction:{auctionId}`。
- 用户私有提醒发送到 `user:{userId}`。
- 禁止全局广播竞拍事件。
- 同一个事件可以发送到多个目标房间，但必须保持相同 `eventId` 和 `serverSeq`。

## 2. 连接流程

```txt
connect
  -> joinRoom
  -> joinAuction
  -> requestSnapshot 或 GET /auctions/:auctionId/snapshot
  -> render snapshot
  -> apply future events
```

客户端不能依赖历史事件恢复状态。首次加载和重连后必须拉取 snapshot。

## 3. 事件顺序与版本

所有竞拍业务服务端事件都必须携带统一元信息：

```json
{
  "eventId": "evt_1",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 18,
  "serverTime": "2026-06-01T09:59:52.000Z"
}
```

字段规则：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `eventId` | string | 是 | 事件唯一 ID，用于日志追踪和去重 |
| `auctionId` | string | 是 | 竞拍 ID |
| `roomId` | string | 是 | 直播间 ID |
| `serverSeq` | integer | 是 | 单场竞拍内单调递增序列号 |
| `serverTime` | string | 是 | 服务端时间，用于客户端校准 |

客户端处理规则：

- 每个 `auctionId` 本地保存 `lastAppliedServerSeq`。
- 如果收到 `serverSeq <= lastAppliedServerSeq`，丢弃事件。
- 如果收到 `serverSeq > lastAppliedServerSeq + 1`，立即重新拉取 snapshot。
- 拉取 snapshot 后用 `snapshot.serverSeq` 覆盖本地序列基准。
- 页面倒计时只使用 `snapshot.serverTime` 和 `endTime` 校准，不信任本地绝对时间。
- WebSocket 事件只做增量提示，不作为最终状态来源。

## 4. 客户端发送事件

### joinRoom

```json
{
  "roomId": "room_1"
}
```

### joinAuction

```json
{
  "auctionId": "auction_1"
}
```

### leaveAuction

```json
{
  "auctionId": "auction_1"
}
```

### requestSnapshot

```json
{
  "auctionId": "auction_1"
}
```

服务端可以返回 `AUCTION_SNAPSHOT`，也可以要求客户端调用 `GET /auctions/:auctionId/snapshot`。无论哪种方式，快照都必须包含 `serverSeq`。

### PING

```json
{
  "clientTime": "2026-06-01T09:59:51.000Z"
}
```

## 5. 服务端事件

### AUCTION_STARTED

发送到：`room:{roomId}`、`auction:{auctionId}`。

```json
{
  "eventId": "evt_1",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 1,
  "serverTime": "2026-06-01T09:55:00.000Z",
  "status": "RUNNING",
  "startPriceFen": 0,
  "currentPriceFen": 0,
  "startTime": "2026-06-01T09:55:00.000Z",
  "endTime": "2026-06-01T10:00:00.000Z"
}
```

### AUCTION_SNAPSHOT

发送到：请求方 socket 或 `user:{userId}`。

```json
{
  "eventId": "evt_snapshot_1",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 17,
  "serverTime": "2026-06-01T09:59:51.000Z",
  "status": "RUNNING",
  "currentPriceFen": 85000,
  "nextBidAmountFen": 90000,
  "highestBidderMaskedName": "张**",
  "myBidAmountFen": null,
  "myRank": null,
  "bidCount": 13,
  "participantCount": 100,
  "endTime": "2026-06-01T10:00:00.000Z",
  "leaderboard": []
}
```

### BID_ACCEPTED

发送到：`auction:{auctionId}`。

```json
{
  "eventId": "evt_18",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 18,
  "serverTime": "2026-06-01T09:59:52.000Z",
  "bidId": "bid_1",
  "userId": "user_1",
  "maskedName": "张**",
  "amountFen": 90000,
  "currentPriceFen": 90000,
  "bidCount": 14
}
```

### BID_REJECTED

发送到：`user:{userId}`。

```json
{
  "eventId": "evt_reject_1",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 18,
  "serverTime": "2026-06-01T09:59:52.000Z",
  "clientBidId": "uuid-from-client",
  "code": "BID_AMOUNT_TOO_LOW",
  "message": "出价必须高于当前价"
}
```

拒绝事件不会推进竞拍状态；`serverSeq` 使用当前已提交状态序列，客户端不得因此覆盖更新后的快照。

### OUTBID

发送到：被超越用户的 `user:{userId}`。

```json
{
  "eventId": "evt_18_outbid",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 18,
  "serverTime": "2026-06-01T09:59:52.000Z",
  "currentPriceFen": 90000,
  "message": "你已被超越"
}
```

### LEADING

发送到：新最高出价用户的 `user:{userId}`。

```json
{
  "eventId": "evt_18_leading",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 18,
  "serverTime": "2026-06-01T09:59:52.000Z",
  "amountFen": 90000,
  "message": "当前您已是最高价"
}
```

### AUCTION_EXTENDED

发送到：`auction:{auctionId}`。

```json
{
  "eventId": "evt_19",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 19,
  "serverTime": "2026-06-01T09:59:52.000Z",
  "oldEndTime": "2026-06-01T10:00:00.000Z",
  "newEndTime": "2026-06-01T10:00:15.000Z",
  "extendedCount": 1
}
```

### AUCTION_ENDED

发送到：`room:{roomId}`、`auction:{auctionId}`。

```json
{
  "eventId": "evt_25",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 25,
  "serverTime": "2026-06-01T10:00:00.000Z",
  "status": "ENDED_SOLD",
  "finalPriceFen": 100000,
  "winnerMaskedName": "张**",
  "orderId": "order_1"
}
```

流拍时：

```json
{
  "eventId": "evt_25",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 25,
  "serverTime": "2026-06-01T10:00:00.000Z",
  "status": "ENDED_UNSOLD",
  "finalPriceFen": null,
  "winnerMaskedName": null,
  "orderId": null
}
```

### ORDER_CREATED

发送到：`user:{buyerId}` 和管理端订阅的订单房间。

```json
{
  "eventId": "evt_26",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 26,
  "serverTime": "2026-06-01T10:00:00.000Z",
  "orderId": "order_1",
  "buyerId": "user_1",
  "amountFen": 100000
}
```

### AUCTION_CANCELLED

发送到：`room:{roomId}`、`auction:{auctionId}`。

```json
{
  "eventId": "evt_20",
  "auctionId": "auction_1",
  "roomId": "room_1",
  "serverSeq": 20,
  "serverTime": "2026-06-01T09:58:00.000Z",
  "reason": "商品状态异常"
}
```

### PONG

心跳响应不是竞拍状态事件，不参与 `serverSeq` 顺序控制。

```json
{
  "eventId": "evt_pong_1",
  "serverTime": "2026-06-01T09:59:51.000Z"
}
```

## 6. 测试要求

WebSocket 实现必须覆盖：

- 用户可加入直播间和竞拍房间。
- `BID_ACCEPTED` 只到达同一竞拍房间用户。
- `OUTBID` 和 `LEADING` 只到达对应用户房间。
- 不同直播间和不同竞拍之间事件不串房。
- 重连后可以拉取包含 `serverSeq` 的最新 snapshot。
- 乱序旧事件不会覆盖新快照。
- 发现 `serverSeq` 跳号时会重新拉取 snapshot。
