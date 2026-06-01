# 性能测试报告

本文档只记录可复现的真实性能数据。Day 12 已补充真实 HTTP + Redis + MySQL 并发压测脚本和 30/100 出价基线数据；2026-06-01 已新增 Socket.IO 连接压测脚本入口，但 100/1000 真实连接结果仍待在启动完整环境后记录。

## 0. 当前状态

当前基线为 Day 12，已实现用户端出价 API、Redis Lua 原子出价、Socket.IO 房间隔离、重连 snapshot、outbox claim/lease 发布、Redis/DB 对账审计、管理端事务式创建商品 / 竞拍表单、管理端工作台和移动端真实 REST / Socket.IO 联动，并补充服务级异常场景 e2e。Day 12 HTTP 压测脚本 `pnpm perf:day12` 可自动准备压测用户、创建竞拍、启动竞拍、并发出价并校验 Redis/DB/snapshot/订单一致性；Socket.IO 脚本 `pnpm perf:socket` 可批量连接、加入房间并请求 snapshot。

## 1. 测试环境

| 字段 | 内容 |
| --- | --- |
| 日期 | 2026-05-31 |
| 机器配置 | 本机 Windows + Docker Desktop，具体 CPU/内存待补 |
| Node.js 版本 | v24.13.0 |
| 数据库 | Docker `mysql:8.0`，端口 `127.0.0.1:3307` |
| Redis | Docker `redis:7-alpine`，端口 `127.0.0.1:6379` |
| 后端启动方式 | `pnpm dev:server`，NestJS dev server |
| 压测工具 | `apps/server/src/performance/day12-http-load.ts`；k6 模板已提供但本轮未执行 |

## 2. 场景记录

| scenario | environment | WebSocket connections | bid attempts | success rate | avg latency | p95 latency | max latency | observed errors | consistency verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 并发出价 | 单元级 fake 环境，验证一致性，不作为性能数据 | 0 | 30 | 100% accepted in ordered test inputs | 未测 | 未测 | 未测 | 无 | 通过：当前价单调、最高出价人唯一、bidCount=accepted Bid 数 |
| 100 并发出价 | 单元级 fake 环境，验证一致性，不作为性能数据 | 0 | 100 | 100% accepted in ordered test inputs | 未测 | 未测 | 未测 | 无 | 通过：当前价单调、最高出价人唯一、bidCount=accepted Bid 数 |
| WebSocket 房间隔离 | 单元级 fake gateway，验证目标房间，不作为性能数据 | 未测真实连接数 | 0 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：`BID_ACCEPTED` 到竞拍房间，`LEADING`/`OUTBID` 到用户房间 |
| 移动端 Day 9 真实联动页面 | Vite typecheck + build，不作为性能数据 | 0 | 0 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：真实 REST service、Socket.IO client 接入和页面构建通过 |
| 管理端 Day 10 创建表单 | Vite typecheck + build，不作为性能数据 | 0 | 0 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：商品上架 / 竞拍规则配置页面构建通过 |
| Day 10 核心闭环 e2e | 服务级 fake Prisma / fake Redis store，不作为真实性能数据 | 0 | 1 | 100% | 未测 | 未测 | 未测 | 无 | 通过：创建商品、创建竞拍、启动、用户端可见、封顶成交、后台订单可见 |
| Day 11 异常场景 e2e | 服务级 fake Prisma / fake Redis store，不作为真实性能数据 | 0 | 多场景服务调用 | 100% | 未测 | 未测 | 未测 | 无 | 通过：无人流拍、一人成交、连续出价、延时、封顶、取消、重复点击、结束/取消后拒绝、snapshot 恢复 |
| Day 12 HTTP 30 并发出价 | 真实 server + MySQL + Redis，本地 dev server | 0 | 30 | accepted 23/30，76.67%；其余为受控 `BID_AMOUNT_TOO_LOW` | 546.05ms | 930.60ms | 937.00ms | `BID_AMOUNT_TOO_LOW` x7 | 通过：当前价 30000，最高出价人 `day12_user_30`，bidCount=23，Redis 与 DB 一致，无重复订单 |
| Day 12 HTTP 100 并发出价 | 真实 server + MySQL + Redis，本地 dev server | 0 | 100 | accepted 80/100，80.00%；其余为受控 `BID_AMOUNT_TOO_LOW` | 1905.17ms | 3516.74ms | 3681.51ms | `BID_AMOUNT_TOO_LOW` x20 | 通过：当前价 100000，最高出价人 `day12_user_100`，bidCount=80，Redis 与 DB 一致，无重复订单 |
| Redis accepted 后 DB 失败补偿 | 单元级 fake 环境，验证一致性，不作为性能数据 | 0 | 1 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：DB 失败后触发 Redis 安全回滚并记录审计 |
| outbox FAILED 重试 | 单元级 fake gateway，验证可重试，不作为性能数据 | 0 | 0 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：FAILED 事件后续发布成功后标记 PUBLISHED |
| outbox claim/lease 和死信 | 单元级 fake gateway，验证多实例发布语义，不作为性能数据 | 0 | 0 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：PENDING/FAILED/过期 PROCESSING 可 claim，超过最大尝试进入 DEAD_LETTER |
| Redis/DB 对账 worker | 单元级 fake Redis/DB，验证差异检测，不作为性能数据 | 0 | 0 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：无热状态不误报，热状态差异写审计 |
| Socket.IO 连接压测脚本 | 已新增 `pnpm perf:socket`，尚未记录真实连接结果 | 待填 | 0 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| 1000 WebSocket 连接 | 未执行：需启动完整 server + MySQL + Redis 后运行 `SOCKET_CONNECTIONS=1000 pnpm perf:socket` | 待填 | 0 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |

## 2.1 Day 12 过程发现和修复

| 问题 | 现象 | 修复 | 验证 |
| --- | --- | --- | --- |
| Redis Lua `ZSCORE` 空值解析 | 首次真实压测时出价接口返回 500，日志为 `Redis bid script returned an invalid number field` | Lua 中将 `previousUserLeaderboardAmountFen` 转为 number 或省略；解析器兼容 Redis nil 被编码为 `false` 的情况 | 新增 `RedisBidAtomicStore.placeBid` 单元测试，真实 30/100 HTTP 压测通过 |
| Redis accepted 后 DB 持久化乱序 | 高并发下高 `serverSeq` 可能先更新 DB，低 `serverSeq` 随后触发 `BID_PERSISTENCE_FAILED` 且 Redis 回滚失败 | `BidService` 增加当前单进程内按 `auctionId` 串行的出价处理队列；2026-06-01 再增加 Redis 分布式锁，覆盖多实例下同一竞拍的 Redis accepted 到 DB 落库顺序 | 新增单元测试模拟慢速第一口和快速第二口、失败 accepted bid 先回滚再处理后续出价、锁调用和锁等待超时错误；最新 30/100 HTTP 压测一致性通过 |

当前队列 + Redis 分布式锁补强优先保证单竞拍一致性，代价是同一场竞拍的有效出价处理被串行化；100 并发本机 dev server p95 升至 3516.74ms。Day 14 演示可接受，生产化仍需要评估 Redis Stream / BullMQ / DB claim 等队列化方案来降低锁等待带来的尾延迟。

## 3. 一致性校验口径

压测结束后必须检查：

- 当前价单调递增，没有价格倒退。
- 最高出价人唯一。
- accepted Bid 数量等于竞拍 `bidCount`。
- `ENDED_SOLD` 竞拍最多只有一个订单。
- Redis 热状态和数据库 `AuctionSession` 可对账。
- WebSocket 客户端没有收到低于最新价格的成功事件。

## 4. 脚本入口

```bash
pnpm perf:day12
$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS
pnpm perf:day12:k6
pnpm perf:socket
$env:SOCKET_CONNECTIONS='1000'; pnpm perf:socket; Remove-Item Env:SOCKET_CONNECTIONS
```

`perf:day12:k6` 需要本机安装 k6，并且需要先准备并启动竞拍后设置 `DAY12_AUCTION_ID`。k6 p95 阈值可通过 `DAY12_P95_THRESHOLD_MS` 调整，默认按当前本机 dev server 基线设为 5000ms。`perf:socket` 默认连接 `room_1` 并自动选择一场竞拍，也可设置 `SOCKET_AUCTION_ID` 固定竞拍。当前真实性能数据仍来自 Node HTTP 脚本，Socket.IO 结果待执行后补表。

## 5. 待补充

- 100/1000 Socket.IO 连接压测结果。
- 原始压测输出文件归档。
- 多轮平均结果和优化前后对比。
- 生产模式 `pnpm build && pnpm --filter @live-auction/server start` 下的压测数据。

## 6. 压测准入条件

正式记录结果前必须满足：

- 出价接口返回稳定错误码，不暴露堆栈。
- `clientBidId` 幂等已实现。
- 达到封顶价的结算路径已实现并有自动化测试。
- 压测结束后可校验 `Bid`、`AuctionSession`、`Order` 和 Redis 热状态。
- WebSocket 压测必须按 `room:{roomId}`、`auction:{auctionId}` 验证事件不泄漏。
