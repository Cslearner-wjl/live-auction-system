# Redis 与数据库一致性方案

本文档约束高并发出价路径的状态一致性。Day 12 已落地 MVP 出价路径、outbox 发布和真实 HTTP 压测：Redis Lua 原子接受/拒绝，当前单进程内按 `auctionId` 串行处理同一竞拍的幂等检查、Redis Lua 和 DB 持久化，DB transaction 写 Bid、AuctionSession 快照和 AuctionEvent outbox，发布器基于已落库 outbox 定向广播，并对 Redis accepted 后 DB 失败执行安全回滚。目标是避免 Redis 已接受出价但数据库没有记录、前端已收到成功但后端无法结算的情况。

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
2. 进入当前进程内的 `auctionId` 级出价处理队列，避免同一竞拍多个请求在 Redis accepted 与 DB 落库之间产生不可回滚缺口
3. 队列内检查 Bid(auctionId, clientBidId)，已存在则返回幂等结果
4. 队列内读取最新 AuctionSession + AuctionRule + Order 快照，确认竞拍仍可接收出价
5. 调用 Redis Lua 原子校验和更新热状态
6. Lua 返回 accepted/rejected + serverSeq + currentPriceFen + bidCount + endTime
7. accepted 后开启 DB transaction
8. 写 Bid 表
9. 条件更新 AuctionSession 快照字段，条件包含 status=RUNNING 和 serverSeq 递增；若未命中 1 条记录，进入一致性补偿
10. 写 AuctionEvent(type=BID_ACCEPTED, outboxStatus=PENDING)
11. transaction 提交
12. 如达到 capPriceFen，调用 AuctionStateMachineService.settleSoldAuction 立即成交
13. 如触发防狙击延时，调用 AuctionSchedulerService.scheduleEndTimer 重排 timer
```

Day 10 已实现：`AuctionEventPublisherService` 读取 `AuctionEvent(outboxStatus=PENDING|FAILED)` 后广播，并在成功后标记 `PUBLISHED`；发布失败时标记 `FAILED` 并写 `AuditLog(action=AUCTION_EVENT_PUBLISH_FAILED)`。

Day 12 修复：真实 HTTP 并发压测发现 Redis Lua 能按顺序 accepted 多个出价，但 DB transaction 并发执行时可能高 `serverSeq` 先更新 `AuctionSession`，导致低 `serverSeq` 后续持久化失败且无法安全回滚 Redis。

Day 13 审查补强：仅串行化 DB 持久化仍不够稳，因为某个 Redis accepted 出价若 DB 写失败且后面已有更高 `serverSeq` accepted，回滚会被拒绝，DB 可能出现 bidCount / Bid / outbox 缺口。当前 MVP 在单进程内把同一竞拍的幂等检查、最新 DB 快照读取、Redis Lua 和 DB 持久化整体放入 `auctionId` 级队列，保证失败 accepted bid 可以先完成安全回滚，再处理后续请求。多实例部署不能依赖本地内存队列，后续需要 Redis Stream、消息队列、DB claim 或分布式锁。

Lua 返回结构：

```json
{
  "accepted": true,
  "auctionId": "auction_1",
  "amountFen": 90000,
  "previousPriceFen": 85000,
  "currentPriceFen": 90000,
  "previousHighestBidderId": "user_2",
  "previousEndTimeMs": 1780308000000,
  "previousExtendedCount": 0,
  "previousBidCount": 13,
  "previousUserLeaderboardAmountFen": null,
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

Day 12 修复：Redis Lua 的 `ZSCORE` 在用户没有历史排行榜分数时会返回 nil，经 Redis Lua/cjson 路径可能表现为 `false`；有历史分数时可能表现为字符串。`previousUserLeaderboardAmountFen` 现在在 Lua 内转换为 number 或省略，TypeScript 解析器也兼容 `false` 和数字字符串，避免真实 Redis 路径返回 500。

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
- DB transaction 内必须确认 `AuctionSession.updateMany` 命中 1 条记录，避免 Bid / outbox 已写但竞拍快照未推进。
- DB 写失败时，如果该 Redis accepted 仍是最新 `serverSeq`，调用 Redis 回滚脚本恢复当前价、最高出价人、结束时间、延时次数、出价次数、排行榜和 `clientBidId` 热幂等键。
- 如果 Redis 状态已经被后续出价推进，回滚脚本返回失败，不强行覆盖后续热状态。
- DB 写失败时，返回 `503 BID_PERSISTENCE_FAILED`，不广播成功事件。
- 记录 `AuditLog(action=DB_WRITE_FAILED_AFTER_REDIS_ACCEPTED)`，包含 `auctionId`、`userId`、`clientBidId`、`serverSeq` 和 `redisRollbackSucceeded`。
- 后续对账流程根据 Redis 热状态和 `auction_events` 修复；当前已具备单次失败安全回滚，尚未实现周期自动对账 worker。
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
- 广播失败时保留 `outboxStatus=FAILED`，发布器后续轮询会再次扫描 `FAILED` 事件并重试，成功后标记 `PUBLISHED`。
- 客户端发现 `serverSeq` 跳号后拉 snapshot。

## 7. 对账任务

建议提供后台对账命令或定时任务：

- 扫描 `RUNNING` 竞拍，比较 Redis `current_price_fen` 和 DB `AuctionSession.currentPriceFen`。
- 比较 Redis `bid_count` 和 DB accepted Bid 数量。
- 检查 `ENDED_SOLD` 是否存在唯一订单。
- 检查 `AuctionEvent(outboxStatus=FAILED)` 并重试广播。
- 对账失败写 `AuditLog(action=CONSISTENCY_CHECK_FAILED)`。
