# 手工测试清单

本文档用于记录难以完全自动化的演示级流程。每次完成相关功能后，在结果栏记录日期、环境和结论。

| 场景 | 前置条件 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- | --- |
| 后台创建商品 | 已启动服务端，数据库已 seed `admin_1` | 调用 `POST /admin/items`，带 `X-Demo-Role: admin` | 返回 `201` 和商品 DTO，`sellingPoints` 被规范化保存 | 待测 |
| 后台创建 0 元起拍竞拍 | 已有 `room_1` 和商品 | 调用 `POST /admin/auctions`，`startPriceFen: 0`、`incrementFen > 0`、`capPriceFen > 0` | 返回 `SCHEDULED` 竞拍，`currentPriceFen` 为 `0` | 单元测试已覆盖核心规则，接口待测 |
| 后台拒绝非法规则 | 已启动服务端 | 创建竞拍时传 `incrementFen: 0` 或 `capPriceFen <= startPriceFen` | 返回 `400 VALIDATION_FAILED`，错误字段稳定 | 单元测试已覆盖核心规则，接口待测 |
| 开拍后禁止改规则 | 已创建并启动竞拍 | 调用 `PATCH /admin/auctions/:id/rules` | 返回 `409 RULE_CANNOT_BE_CHANGED_AFTER_START` | 单元测试已覆盖核心规则，接口待测 |
| 后台取消竞拍 | 竞拍为 `SCHEDULED` 或 `RUNNING` | 调用 `POST /admin/auctions/:id/cancel` 并填写原因 | 状态变为 `CANCELLED`，返回取消原因和时间 | 接口已实现，待测 |
| 无人出价到期流拍 | 已创建并启动竞拍，时长较短 | 不提交任何出价，等待到期 | 状态变为 `ENDED_UNSOLD`，不生成订单；WebSocket 结束事件待网关实现 | 2026-05-24：状态机单元测试已覆盖，真实 timer 接口流程待测 |
| 单人出价成交 | 竞拍运行中 | 用户 A 提交有效出价，等待到期 | 状态变为 `ENDED_SOLD`，生成一个订单，买家为用户 A | 2026-05-24：状态机单元测试已覆盖；出价 API 尚未实现，需通过后续 Day 5 流程补测 |
| 多人连续出价 | 竞拍运行中，至少 2 个用户窗口 | 用户 A、B 交替按固定幅度出价 | 当前价单调递增，最高出价人唯一，被超越用户收到提醒 | 待测 |
| 重复 clientBidId | 竞拍运行中 | 同一用户用相同 `clientBidId` 重复提交 | 不产生重复 Bid，返回幂等结果或 `DUPLICATE_CLIENT_BID` | 待测 |
| 最后 N 秒自动延时 | 配置防狙击窗口和延时时长 | 在结束前 N 秒提交有效出价 | `endTime` 延后，广播 `AUCTION_EXTENDED`，旧 timer 不再结算 | 待测 |
| 封顶价立即成交 | 配置封顶价 | 用户提交达到封顶价的有效出价 | 立即结算为 `ENDED_SOLD`，只生成一个订单 | 待测 |
| 主播取消竞拍 | 竞拍 `SCHEDULED` 或 `RUNNING` | 后台点击取消并填写原因 | 状态变为 `CANCELLED`，本进程结束 timer 被清理；用户端取消事件待网关实现 | 接口已实现，timer 清理由 Day 4 接入，端到端待测 |
| 断线重连 snapshot 恢复 | 竞拍运行中且已有出价 | 断开移动端 WebSocket 后重连 | 重新拉取 snapshot，当前价、倒计时和领先状态正确 | 待测 |
| 订单唯一性 | 多用户并发冲击封顶价 | 同时提交多个达到封顶价的出价 | 仅一个最高出价人，仅一个订单 | 2026-05-24：重复结束不重复建单已由状态机单元测试覆盖；并发封顶待 Day 5 出价引擎实现后补测 |

## Day 4 补充检查

| 场景 | 前置条件 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- | --- |
| 服务启动恢复结束 timer | 数据库存在 `RUNNING` 且 `endTime` 未来的竞拍 | 重启服务端 | `AuctionSchedulerService` 扫描后重新注册 timer | 待测 |
| 服务启动立即结算过期竞拍 | 数据库存在 `RUNNING` 且 `endTime` 已过去的竞拍 | 重启服务端 | 状态机立即结算为成交或流拍 | 单元测试覆盖结算分支，恢复扫描待集成测试 |
| 管理端查询订单 | 已有 `ENDED_SOLD` 竞拍并生成订单 | 调用 `GET /admin/orders` 和 `GET /admin/orders/:orderId` | 返回 `PENDING_PAYMENT` 订单 DTO，金额为落槌价 | 接口已实现，待本地联调 |

## 记录格式

```txt
日期：
环境：
场景：
结果：
问题：
证据：
```
