# 性能测试报告

本文档只记录可复现的真实性能数据。当前尚未完成外部压测；Day 5-Day 11 已补充服务端单元级一致性、房间隔离、管理端类型检查 / 构建检查、移动端真实联动构建检查和服务级异常场景 e2e，不能等同于真实性能数据。

## 0. 当前状态

当前基线为 Day 11，已实现用户端出价 API、Redis Lua 原子出价、Socket.IO 房间隔离、重连 snapshot、outbox 广播发布、管理端创建商品 / 竞拍表单、管理端工作台和移动端真实 REST / Socket.IO 联动，并补充服务级异常场景 e2e，但尚未实现正式压测脚本。本轮继续只记录单元级、服务级闭环和构建结果：30 和 100 并发出价均通过当前价单调、最高出价人唯一、`bidCount` 与 accepted Bid 数一致的断言；WebSocket 房间隔离和私有提醒通过 fake gateway 单元测试验证；Day 10 核心闭环和 Day 11 异常场景通过服务级 e2e 验证。Day 12 后需要用 k6 或 Artillery 对真实 HTTP + Redis + MySQL + Socket.IO 环境补充性能数据。

## 1. 测试环境

| 字段 | 内容 |
| --- | --- |
| 日期 | 2026-05-31 |
| 机器配置 | 待填 |
| Node.js 版本 | 待填 |
| 数据库 | MySQL，版本待填 |
| Redis | 版本待填 |
| 后端启动方式 | 未启动真实服务；当前为 Node 内置测试 + fake Prisma/fake Redis store/fake Socket.IO gateway |
| 压测工具 | 待补充 k6 / Artillery；本轮不是正式压测 |

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
| Redis accepted 后 DB 失败补偿 | 单元级 fake 环境，验证一致性，不作为性能数据 | 0 | 1 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：DB 失败后触发 Redis 安全回滚并记录审计 |
| outbox FAILED 重试 | 单元级 fake gateway，验证可重试，不作为性能数据 | 0 | 0 | 不适用 | 未测 | 未测 | 未测 | 无 | 通过：FAILED 事件后续发布成功后标记 PUBLISHED |
| 1000 WebSocket 连接 | 未执行：等待正式压测脚本和真实 Socket.IO 服务压测 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |

## 3. 一致性校验口径

压测结束后必须检查：

- 当前价单调递增，没有价格倒退。
- 最高出价人唯一。
- accepted Bid 数量等于竞拍 `bidCount`。
- `ENDED_SOLD` 竞拍最多只有一个订单。
- Redis 热状态和数据库 `AuctionSession` 可对账。
- WebSocket 客户端没有收到低于最新价格的成功事件。

## 4. 待补充

- 压测脚本路径。
- 原始压测输出。
- 异常日志摘要。
- 优化前后对比。
- 真实 Redis Lua + MySQL 环境下的 30/100 HTTP 并发请求延迟。

## 5. 压测准入条件

正式记录结果前必须满足：

- 出价接口返回稳定错误码，不暴露堆栈。
- `clientBidId` 幂等已实现。
- 达到封顶价的结算路径已实现并有自动化测试。
- 压测结束后可校验 `Bid`、`AuctionSession`、`Order` 和 Redis 热状态。
- WebSocket 压测必须按 `room:{roomId}`、`auction:{auctionId}` 验证事件不泄漏。
