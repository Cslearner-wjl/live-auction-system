# 手工测试清单

本文档用于记录难以完全自动化的演示级流程。每次完成相关功能后，在结果栏记录日期、环境和结论。

当前基线：Day 7 已完成。出价 API、Redis Lua、封顶成交、防狙击延时、Socket.IO 房间隔离、outbox 广播、重连 snapshot 和管理端工作台已有自动化或浏览器渲染检查；移动端真实页面联动尚未实现，相关场景继续保留为 Day 8/Day 9 验收入口。

| 场景 | 前置条件 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- | --- |
| 后台创建商品 | 已启动服务端，数据库已 seed `admin_1` | 调用 `POST /admin/items`，带 `X-Demo-Role: admin` | 返回 `201` 和商品 DTO，`sellingPoints` 被规范化保存 | 待测 |
| 后台创建 0 元起拍竞拍 | 已有 `room_1` 和商品 | 调用 `POST /admin/auctions`，`startPriceFen: 0`、`incrementFen > 0`、`capPriceFen > 0` | 返回 `SCHEDULED` 竞拍，`currentPriceFen` 为 `0` | 单元测试已覆盖核心规则，接口待测 |
| 后台拒绝非法规则 | 已启动服务端 | 创建竞拍时传 `incrementFen: 0` 或 `capPriceFen <= startPriceFen` | 返回 `400 VALIDATION_FAILED`，错误字段稳定 | 单元测试已覆盖核心规则，接口待测 |
| 开拍后禁止改规则 | 已创建并启动竞拍 | 调用 `PATCH /admin/auctions/:id/rules` | 返回 `409 RULE_CANNOT_BE_CHANGED_AFTER_START` | 单元测试已覆盖核心规则，接口待测 |
| 后台取消竞拍 | 竞拍为 `SCHEDULED` 或 `RUNNING` | 调用 `POST /admin/auctions/:id/cancel` 并填写原因 | 状态变为 `CANCELLED`，返回取消原因和时间，写入 `AUCTION_CANCELLED` outbox | 2026-05-27：状态机单元测试覆盖取消 outbox；真实接口待 Docker 环境补测 |
| 无人出价到期流拍 | 已创建并启动竞拍，时长较短 | 不提交任何出价，等待到期 | 状态变为 `ENDED_UNSOLD`，不生成订单；outbox 产生并广播 `AUCTION_ENDED` | 2026-05-26：状态机 outbox 事件单元测试覆盖，真实 timer 接口流程待测 |
| 单人出价成交 | 竞拍运行中 | 用户 A 提交有效出价，等待到期 | 状态变为 `ENDED_SOLD`，生成一个订单，买家为用户 A | 2026-05-25：出价落库路径和状态机成交单元测试已覆盖；真实接口流程待测 |
| 多人连续出价 | 竞拍运行中，至少 2 个用户窗口 | 用户 A、B 交替按固定幅度出价 | 当前价单调递增，最高出价人唯一，被超越用户收到提醒 | 2026-05-26：服务端出价单元测试覆盖当前价单调，outbox 单元测试覆盖 `OUTBID`/`LEADING` 目标房间；移动端可视化待接入 |
| 重复 clientBidId | 竞拍运行中 | 同一用户用相同 `clientBidId` 重复提交 | 不产生重复 Bid，返回幂等结果或 `DUPLICATE_CLIENT_BID` | 2026-05-25：服务端单元测试已覆盖已落库幂等和并发热幂等 |
| 最后 N 秒自动延时 | 配置防狙击窗口和延时时长 | 在结束前 N 秒提交有效出价 | `endTime` 延后，广播 `AUCTION_EXTENDED`，旧 timer 不再结算 | 2026-05-26：服务端单元测试已覆盖延时、timer 重排和 `AUCTION_EXTENDED` 派发 |
| 封顶价立即成交 | 配置封顶价 | 用户提交达到封顶价的有效出价 | 立即结算为 `ENDED_SOLD`，只生成一个订单 | 2026-05-25：服务端单元测试已覆盖封顶成交和并发封顶单订单 |
| 主播取消竞拍 | 竞拍 `SCHEDULED` 或 `RUNNING` | 后台点击取消并填写原因 | 状态变为 `CANCELLED`，本进程结束 timer 被清理；广播 `AUCTION_CANCELLED` | 2026-05-26：状态机写取消 outbox，发布器房间派发单元测试覆盖；端到端待测 |
| 断线重连 snapshot 恢复 | 竞拍运行中且已有出价 | 断开移动端 WebSocket 后重连 | 重新拉取 snapshot，当前价、倒计时和领先状态正确 | 2026-05-26：`AuctionSnapshotService` 和 gateway `requestSnapshot` 单元测试覆盖；移动端页面待接入 |
| 订单唯一性 | 多用户并发冲击封顶价 | 同时提交多个达到封顶价的出价 | 仅一个最高出价人，仅一个订单 | 2026-05-25：服务端单元测试已覆盖并发封顶只接受一个出价、只创建一个订单 |

## Day 4 补充检查

| 场景 | 前置条件 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- | --- |
| 服务启动恢复结束 timer | 数据库存在 `RUNNING` 且 `endTime` 未来的竞拍 | 重启服务端 | `AuctionSchedulerService` 扫描后重新注册 timer | 待测 |
| 服务启动立即结算过期竞拍 | 数据库存在 `RUNNING` 且 `endTime` 已过去的竞拍 | 重启服务端 | 状态机立即结算为成交或流拍 | 单元测试覆盖结算分支，恢复扫描待集成测试 |
| 管理端查询订单 | 已有 `ENDED_SOLD` 竞拍并生成订单 | 调用 `GET /admin/orders` 和 `GET /admin/orders/:orderId` | 返回 `PENDING_PAYMENT` 订单 DTO，金额为落槌价，并包含商品和买家展示字段 | Day 7 已接入管理端订单页面；真实接口待 Docker 环境补测 |

## Day 5 自动化覆盖

已通过 `apps/server/src/bid/bid.service.test.ts` 覆盖：

- 0 元起拍后的有效出价。
- 低价、非法加价幅度、最高出价人重复出价、超过封顶价、竞拍结束后出价。
- 重复 `clientBidId` 已落库幂等和并发热幂等。
- 防狙击窗口内延长 `endTime` 并重排结束 timer。
- 达到封顶价立即成交并创建一个订单。
- 30 和 100 并发出价，当前价单调递增、最高出价人唯一、`bidCount` 与 accepted Bid 数量一致。

## Day 6 验收入口

已通过 `apps/server/src/realtime/*.test.ts` 覆盖：

- 用户连接后自动加入 `user:{userId}`。
- 用户可加入 `room:{roomId}` 和 `auction:{auctionId}`。
- 出价成功 outbox 只向 `auction:{auctionId}` 发送 `BID_ACCEPTED`。
- `OUTBID` 和 `LEADING` 只发送给相关 `user:{userId}`。
- 延时出价派发 `AUCTION_EXTENDED`。
- 重连后 `requestSnapshot` 返回包含 `serverSeq` 的最新 snapshot。
- outbox 发布成功标记 `PUBLISHED`，失败标记 `FAILED` 并记录审计日志。

仍需后续端到端或手工验证：

- 两个真实浏览器窗口通过 Socket.IO 实时同步。
- 移动端页面按 `serverSeq` 丢弃旧事件并在跳号时重拉 snapshot。
- 竞拍结束事件禁用移动端出价按钮。

## Day 7 自动化和页面检查

已覆盖：

- `apps/server/src/auction/auction-state-machine.service.test.ts` 覆盖取消竞拍写入 `AUCTION_CANCELLED` outbox。
- `apps/server/src/realtime/auction-event-publisher.service.test.ts` 继续覆盖取消事件广播到 `room:{roomId}` 和 `auction:{auctionId}`。
- `apps/admin` 类型检查覆盖管理端 API DTO 和页面状态。
- 浏览器打开 `http://localhost:5173/`，确认管理端标题、竞拍列表、订单 tab 渲染，无前端控制台错误。

待补真实环境检查：

- 2026-05-27：本机 Docker Desktop 未运行，无法启动 MySQL/Redis，因此浏览器里真实 API 返回 `Failed to fetch`；后续启动 Docker 后补测竞拍列表、启动、取消和订单列表。
- 2026-05-27：Docker 已启动后补测通过。`/health` 返回 DB/Redis `ok`；管理端页面真实加载 `GET /admin/auctions` 数据，无前端控制台错误；`POST /admin/auctions/auction_1/start` 成功进入 `RUNNING`；`GET /auctions/auction_1/snapshot` 初次联调发现 `RealtimeController` 未显式注入 `AuctionSnapshotService` 导致 500，已修复并补单元测试；`POST /admin/auctions/auction_1/cancel` 成功返回 `CANCELLED`；最后执行 seed 恢复 `auction_1` 为 `SCHEDULED`。

## 记录格式

```txt
日期：
环境：
场景：
结果：
问题：
证据：
```
