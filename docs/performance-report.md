# 性能测试报告

本文档只记录可复现的真实性能数据。未执行的脚本只记录入口和准入条件，不写成结果。

## 1. 当前结论

- 已有真实 HTTP + MySQL + Redis 30/100 并发出价基线，并且脚本会校验 Redis / DB / snapshot / 订单一致性。
- 已记录 Socket.IO 100/1000 连接压测基线，连接、join、snapshot 和 PING/PONG 成功率均为 100%。
- 当前 100 并发 HTTP 出价本机 dev server p95 约 3.52s，说明一致性保护优先于吞吐，不能作为生产性能承诺。
- 生产构建或云服务器环境下的压测数据尚未记录。

## 2. 测试环境

| 字段 | 内容 |
| --- | --- |
| 日期 | 2026-05-31、2026-06-03 |
| 机器 | 本机 Windows + Docker Desktop，CPU/内存待补 |
| Node.js | v24.13.0 |
| 数据库 | Docker `mysql:8.0`，`127.0.0.1:3307` |
| Redis | Docker `redis:7-alpine`，`127.0.0.1:6379` |
| 后端启动方式 | `pnpm dev:server` |
| HTTP 压测脚本 | `apps/server/src/performance/day12-http-load.ts` |
| Socket.IO 压测脚本 | `apps/server/src/performance/day12-socket-load.ts` |

## 3. 场景记录

| scenario | environment | WebSocket connections | bid attempts | success rate | avg latency | p95 latency | max latency | observed errors | consistency verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HTTP 30 并发出价 | 真实 server + MySQL + Redis，本机 dev server | 0 | 30 | accepted 24/30，80.00% | 未记录 | 873.41ms | 未记录 | 受控低价拒绝 x6 | 通过：Redis / DB / snapshot / 订单一致 |
| HTTP 100 并发出价 | 真实 server + MySQL + Redis，本机 dev server | 0 | 100 | accepted 80/100，80.00% | 1905.17ms | 3516.74ms | 3681.51ms | `BID_AMOUNT_TOO_LOW` x20 | 通过：当前价 100000，最高出价人 `day12_user_100`，bidCount=80，Redis 与 DB 一致，无重复订单 |
| Socket.IO 100 连接 | 真实 server + MySQL + Redis，本机 dev server | 100 | 0 | 连接 / join / snapshot / PING-PONG 100% | 未记录 | 连接 55.47ms；snapshot 183.32ms | 未记录 | 无 | 通过：房间加入和 snapshot 成功 |
| Socket.IO 1000 连接 | 真实 server + MySQL + Redis，本机 dev server | 1000 | 0 | 连接 / join / snapshot / PING-PONG 100% | 未记录 | 连接 501.42ms；snapshot 1715.04ms | 未记录 | 无 | 通过：房间加入和 snapshot 成功 |
| 生产 compose HTTP 出价 | 待执行 | 0 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |

## 4. 一致性校验口径

HTTP 出价压测结束后必须检查：

- 当前价单调递增，没有价格倒退。
- 最高出价人唯一。
- accepted Bid 数量等于竞拍 `bidCount`。
- `ENDED_SOLD` 竞拍最多只有一个订单。
- Redis 热状态和数据库 `AuctionSession` 一致或存在可审计差异。
- snapshot 返回的当前价、出价次数、排名与 DB / Redis 结果一致。

Socket.IO 压测检查口径：

- 连接成功率、join room 成功率、join auction 成功率、snapshot 成功率和 PING/PONG 成功率。
- snapshot 平均延迟、p95 延迟、最大延迟。
- 事件只到达目标 `room:{roomId}`、`auction:{auctionId}` 或 `user:{userId}`。

## 5. 脚本入口

```powershell
pnpm perf:day12
$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS
pnpm perf:day12:k6
pnpm perf:socket
$env:SOCKET_CONNECTIONS='1000'; pnpm perf:socket; Remove-Item Env:SOCKET_CONNECTIONS
```

说明：

- `perf:day12` 会自动准备压测用户、创建竞拍、启动竞拍、并发出价，并做一致性校验。
- `perf:day12:k6` 需要本机安装 k6，并设置 `DAY12_AUCTION_ID`。
- `perf:socket` 默认连接 `room_1` 并自动选择一场竞拍，也可设置 `SOCKET_AUCTION_ID` 固定竞拍。

## 6. 已发现并修复的问题

| 问题 | 现象 | 修复 | 验证 |
| --- | --- | --- | --- |
| Redis Lua `ZSCORE` 空值解析 | 首次真实压测时出价接口返回 500 | Lua 和 TypeScript 解析兼容 Redis nil / false / 字符串返回 | 单元测试和真实 HTTP 30/100 压测通过 |
| Redis accepted 后 DB 持久化乱序 | 高并发下高 `serverSeq` 先更新 DB，低 `serverSeq` 失败且回滚困难 | 同一竞拍先进入本进程队列，再由 Redis 分布式锁保护 Redis accepted 到 DB 落库关键段 | 单元测试覆盖锁、慢请求、失败回滚；HTTP 30/100 一致性通过 |

## 7. 待补充

- 原始压测输出文件归档。
- 多轮平均结果和优化前后对比。
- 生产构建 / 生产 compose 模式下的压测数据。
- 机器 CPU / 内存配置补全。
