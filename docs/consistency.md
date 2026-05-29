# Redis 与数据库一致性方案

本文档约束高并发出价路径的状态一致性。Day 6 已落地 MVP 出价路径和 outbox 发布：Redis Lua 原子接受/拒绝，DB transaction 持久化 Bid、AuctionSession 快照和 AuctionEvent outbox，发布器基于已落库 outbox 定向广播。目标是避免 Redis 已接受出价但数据库没有记录、前端已收到成功但后端无法结算的情况。

## 1. 分层策略

1. Redis Lua 保证实时出价原子性。
2. 数据库唯一约束保证 `clientBidId` 和订单唯一。
3. `auction_events` / outbox 记录待广播和待补偿事件。

原则：

- Redis 是高频热状态，数据库是权威业务记录。
- WebSocket 广播必须基于已落库事件或可靠 outbox。
- 客户端最终以 snapshot 恢复状态，不以旧事件作为权威来源。

## 2. Day 5 placeBid 流程

```txt
1. Controller 校验 DTO 和 demo 身份
2. BidService 先查 Bid(auctionId, clientBidId)，已存在则返回幂等结果
3. 读取 AuctionSession + AuctionRule + Order 快照，确认竞拍仍可接收出价
4. 调用 Redis Lua 原子校验和更新热状态
5. Lua 返回 accepted/rejected + serverSeq + currentPriceFen + bidCount + endTime
6. accepted 时开启 DB transaction
7. 写 Bid 表
8. 条件更新 AuctionSession 快照字段，条件包含 status=RUNNING 和 serverSeq 递增
9. 写 AuctionEvent(type=BID_ACCEPTED, outboxStatus=PENDING)
10. transaction 提交
11. 如达到 capPriceFen，调用 AuctionStateMachineService.settleSoldAuction 立即成交
12. 如触发防狙击延时，调用 AuctionSchedulerService.scheduleEndTimer 重排 timer
```

Day 6 已实现：`AuctionEventPublisherService` 读取 `AuctionEvent(outboxStatus=PENDING)` 后广播，并在成功后标记 `PUBLISHED`；发布失败时标记 `FAILED` 并写 `AuditLog(action=AUCTION_EVENT_PUBLISH_FAILED)`。

Lua 返回结构：

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
  "newExtendedCount": 0,
  "reachedCapPrice": false
}
```

Day 5 Redis 热 key：

```txt
auction:{auctionId}:state                 # hash: status, server_seq, extended_count
auction:{auctionId}:current_price_fen
auction:{auctionId}:highest_bidder_id
auction:{auctionId}:end_time_ms
auction:{auctionId}:bid_count
auction:{auctionId}:leaderboard
auction:{auctionId}:client_bid:{clientBidId}
```

热状态在首次出价时按 DB 快照惰性初始化；竞拍完成后当前实现通过 24 小时 TTL 回收热 key，后续可在结算流程中显式缩短 TTL。

Day 9 修复：Redis Lua 首次初始化 `auction:{auctionId}:state.server_seq` 时必须继承数据库 `AuctionSession.serverSeq`，不能固定从 `0` 开始。否则竞拍启动已写入 `AUCTION_STARTED(serverSeq=1)` 后，第一口出价会再次生成 `BID_ACCEPTED(serverSeq=1)`，触发 `auction_events(auctionId, serverSeq)` 唯一约束冲突并返回 `BID_PERSISTENCE_FAILED`。

Demo seed 重置规则：重置固定演示竞拍 `auction_1` 时，需要同步清理该竞拍的历史 `Bid`、`Order`、`AuctionEvent`、`AuditLog` 和 Redis 热 key，再把 `AuctionSession.serverSeq` 归零。只重置 `auction_sessions` 会保留旧 outbox 序列或 Redis 热状态，导致重复开拍、出价联调不稳定。

## 3. 拒绝出价

拒绝原因由 Redis Lua 或服务层返回稳定错误码：

- 不写 accepted Bid。
- 可选写 `Bid(status=REJECTED)` 或 `AuctionEvent(type=BID_REJECTED)`，用于审计。
- 只向当前用户发送 `BID_REJECTED`。
- 不推进 `serverSeq`；如果实现选择推进，也必须确保 snapshot 和客户端规则一致。

Day 6 当前实现：HTTP 拒绝出价不写 rejected Bid，也不写 `AuctionEvent(BID_REJECTED)`，仍返回统一错误响应；Socket.IO `placeBid` 拒绝时由 gateway 向 `user:{userId}` 发送 `BID_REJECTED`，不推进 `serverSeq`。

## 4. Redis 成功但 DB 写失败

禁止流程：

```txt
Redis Lua accepted -> 直接广播 BID_ACCEPTED -> DB 写失败 -> throw
```

必须采用以下策略之一：

### 4.1 MVP 策略（当前实现）

- Redis accepted 后进入 DB transaction。
- DB 写失败时，返回 `503 BID_PERSISTENCE_FAILED`，不广播成功事件。
- 记录 `AuditLog(action=DB_WRITE_FAILED_AFTER_REDIS_ACCEPTED)`，包含 `auctionId`、`userId`、`clientBidId`、`serverSeq`。
- 后续对账流程根据 Redis 热状态和 `auction_events` 修复；当前仅记录审计日志，尚未实现自动对账 worker。
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

达到 `capPriceFen` 的出价会先落库 Bid 和 AuctionSession 快照，再调用状态机立即成交。并发封顶由 Redis Lua 把热状态置为 `ENDED_SOLD` 阻断后续接受，状态机事务和 `orders.auctionId` 唯一约束继续兜底。

Day 6 新增边界：封顶成交后状态机还会写 `AUCTION_ENDED` 和 `ORDER_CREATED` outbox，数据库 `AuctionSession.serverSeq` 会推进到结束/订单事件序号；Redis 热状态暂不反向同步该最终 `serverSeq`，后续 Redis/DB 对账任务必须覆盖这一差异。

## 6. WebSocket 广播顺序

- `BID_ACCEPTED`、`OUTBID`、`LEADING`、`AUCTION_EXTENDED` 使用同一个 `serverSeq` 或按持久化事件顺序递增。
- 广播 payload 以 `AuctionEvent.payload` 为基础，由 `AuctionEventPublisherService` 统一补充 `eventId`、房间和用户脱敏信息，避免多个服务临时拼装不同版本。
- 广播失败时保留 `outboxStatus=FAILED`，后续可重试。
- 客户端发现 `serverSeq` 跳号后拉 snapshot。

## 7. 对账任务

建议提供后台对账命令或定时任务：

- 扫描 `RUNNING` 竞拍，比较 Redis `current_price_fen` 和 DB `AuctionSession.currentPriceFen`。
- 比较 Redis `bid_count` 和 DB accepted Bid 数量。
- 检查 `ENDED_SOLD` 是否存在唯一订单。
- 检查 `AuctionEvent(outboxStatus=FAILED)` 并重试广播。
- 对账失败写 `AuditLog(action=CONSISTENCY_CHECK_FAILED)`。
