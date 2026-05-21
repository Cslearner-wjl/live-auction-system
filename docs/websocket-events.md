# WebSocket 事件契约

本文档是 Day 1 WebSocket 事件初稿，事件名应与 `packages/shared` 保持一致。

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

## 2. 连接流程

```txt
connect
  -> joinRoom
  -> joinAuction
  -> requestSnapshot 或 GET /auctions/:auctionId/snapshot
  -> render snapshot
  -> apply future events
```

客户端不能依赖历史事件恢复状态。重连后必须重新拉取 snapshot。

## 3. 客户端发送事件草案

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

### PING

```json
{
  "clientTime": "2026-06-01T09:59:51.000Z"
}
```

## 4. 服务端事件

### AUCTION_STARTED

竞拍启动。

```json
{
  "auctionId": "auction_1",
  "roomId": "room_1",
  "status": "RUNNING",
  "startPriceFen": 0,
  "currentPriceFen": 0,
  "startTime": "2026-06-01T09:55:00.000Z",
  "endTime": "2026-06-01T10:00:00.000Z",
  "serverTime": "2026-06-01T09:55:00.000Z"
}
```

### AUCTION_SNAPSHOT

竞拍快照。

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

### BID_ACCEPTED

有效出价被接受。

```json
{
  "auctionId": "auction_1",
  "bidId": "bid_1",
  "userId": "user_1",
  "maskedName": "张**",
  "amountFen": 90000,
  "currentPriceFen": 90000,
  "bidCount": 14,
  "serverTime": "2026-06-01T09:59:52.000Z"
}
```

### BID_REJECTED

出价被拒绝，通常发送给当前用户。

```json
{
  "auctionId": "auction_1",
  "clientBidId": "uuid-from-client",
  "code": "BID_AMOUNT_TOO_LOW",
  "message": "出价必须高于当前价",
  "serverTime": "2026-06-01T09:59:52.000Z"
}
```

### OUTBID

原最高出价用户被超越。

```json
{
  "auctionId": "auction_1",
  "currentPriceFen": 90000,
  "message": "你已被超越",
  "serverTime": "2026-06-01T09:59:52.000Z"
}
```

### LEADING

当前用户成为最高出价人。

```json
{
  "auctionId": "auction_1",
  "amountFen": 90000,
  "message": "当前您已是最高价",
  "serverTime": "2026-06-01T09:59:52.000Z"
}
```

### AUCTION_EXTENDED

结束前出价触发延时。

```json
{
  "auctionId": "auction_1",
  "oldEndTime": "2026-06-01T10:00:00.000Z",
  "newEndTime": "2026-06-01T10:00:15.000Z",
  "extendedCount": 1,
  "serverTime": "2026-06-01T09:59:52.000Z"
}
```

### AUCTION_ENDED

竞拍结束。

```json
{
  "auctionId": "auction_1",
  "status": "ENDED_SOLD",
  "finalPriceFen": 100000,
  "winnerMaskedName": "张**",
  "orderId": "order_1",
  "serverTime": "2026-06-01T10:00:00.000Z"
}
```

### ORDER_CREATED

成交订单已创建。

```json
{
  "auctionId": "auction_1",
  "orderId": "order_1",
  "buyerId": "user_1",
  "amountFen": 100000,
  "serverTime": "2026-06-01T10:00:00.000Z"
}
```

### AUCTION_CANCELLED

主播取消异常竞拍。

```json
{
  "auctionId": "auction_1",
  "reason": "商品状态异常",
  "serverTime": "2026-06-01T09:58:00.000Z"
}
```

### PONG

心跳响应。

```json
{
  "serverTime": "2026-06-01T09:59:51.000Z"
}
```

## 5. 后续补充

Day 6 实现 WebSocket Gateway 后，需要补充：

- 具体命名空间。
- 鉴权方式。
- 事件版本号或序列号。
- 断线重连测试。
- 房间隔离测试。
