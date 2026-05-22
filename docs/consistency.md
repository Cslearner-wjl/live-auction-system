# Redis 与数据库一致性方案

本文档约束高并发出价路径的状态一致性。目标是避免 Redis 已接受出价但数据库没有记录、前端已收到成功但后端无法结算的情况。

## 1. 分层策略

1. Redis Lua 保证实时出价原子性。
2. 数据库唯一约束保证 `clientBidId` 和订单唯一。
3. `auction_events` / outbox 记录待广播和待补偿事件。

原则：

- Redis 是高频热状态，数据库是权威业务记录。
- WebSocket 广播必须基于已落库事件或可靠 outbox。
- 客户端最终以 snapshot 恢复状态，不以旧事件作为权威来源。

## 2. placeBid 流程

```txt
1. Controller 校验 DTO 和 demo 身份
2. BidService 读取必要竞拍配置
3. 调用 Redis Lua
4. Lua 返回 accepted/rejected + stateVersion/serverSeq
5. accepted 时开启 DB transaction
6. 写 Bid 表
7. 更新 AuctionSession 快照字段
8. 写 AuctionEvent(outboxStatus=PENDING)
9. transaction 提交
10. 广播 WebSocket
11. 标记 AuctionEvent(outboxStatus=PUBLISHED)
```

Lua 返回结构建议：

```json
{
  "accepted": true,
  "auctionId": "auction_1",
  "amountFen": 90000,
  "previousPriceFen": 85000,
  "currentPriceFen": 90000,
  "previousHighestBidderId": "user_2",
  "highestBidderId": "user_1",
  "bidCount": 14,
  "serverSeq": 18,
  "extended": false,
  "newEndTimeMs": 1780308015000,
  "reachedCapPrice": false
}
```

## 3. 拒绝出价

拒绝原因由 Redis Lua 或服务层返回稳定错误码：

- 不写 accepted Bid。
- 可选写 `Bid(status=REJECTED)` 或 `AuctionEvent(type=BID_REJECTED)`，用于审计。
- 只向当前用户发送 `BID_REJECTED`。
- 不推进 `serverSeq`；如果实现选择推进，也必须确保 snapshot 和客户端规则一致。

## 4. Redis 成功但 DB 写失败

禁止流程：

```txt
Redis Lua accepted -> 直接广播 BID_ACCEPTED -> DB 写失败 -> throw
```

必须采用以下策略之一：

### 4.1 MVP 策略

- Redis accepted 后进入 DB transaction。
- DB 写失败时，返回 `409` 或 `503` 级可重试错误，不广播成功事件。
- 记录 `AuditLog(action=DB_WRITE_FAILED_AFTER_REDIS_ACCEPTED)`，包含 `auctionId`、`userId`、`clientBidId`、`serverSeq`。
- 标记补偿任务，由对账流程根据 Redis 热状态和 `auction_events` 修复。
- 客户端收到失败后重新拉 snapshot，而不是假设出价成功。

### 4.2 进阶策略

- Redis Lua 同时写入 Redis Stream outbox。
- 后台 worker 消费 stream 并写 DB。
- WebSocket 广播只发生在 DB 写入和 `AuctionEvent` 持久化之后。
- worker 支持重试和死信队列。

## 5. 订单一致性

成交结算必须在状态机事务中完成：

```txt
begin transaction
  update auction_sessions
    set status = ENDED_SOLD
    where id = ? and status = RUNNING
  if affectedRows == 0: return already_finished
  insert orders(auctionId, itemId, buyerId, amountFen)
  insert auction_events(AUCTION_ENDED)
commit
```

兜底约束：

- `orders.auctionId` 唯一。
- 重复调用 `finishAuction` 不得生成第二个订单。
- 无最高出价人时进入 `ENDED_UNSOLD`，不写订单。

## 6. WebSocket 广播顺序

- `BID_ACCEPTED`、`OUTBID`、`LEADING`、`AUCTION_EXTENDED` 使用同一个 `serverSeq` 或按持久化事件顺序递增。
- 广播 payload 来自 `AuctionEvent.payload`，不得由多个服务临时拼装不同版本。
- 广播失败时保留 `outboxStatus=FAILED`，后续可重试。
- 客户端发现 `serverSeq` 跳号后拉 snapshot。

## 7. 对账任务

建议提供后台对账命令或定时任务：

- 扫描 `RUNNING` 竞拍，比较 Redis `current_price_fen` 和 DB `AuctionSession.currentPriceFen`。
- 比较 Redis `bid_count` 和 DB accepted Bid 数量。
- 检查 `ENDED_SOLD` 是否存在唯一订单。
- 检查 `AuctionEvent(outboxStatus=FAILED)` 并重试广播。
- 对账失败写 `AuditLog(action=CONSISTENCY_CHECK_FAILED)`。
