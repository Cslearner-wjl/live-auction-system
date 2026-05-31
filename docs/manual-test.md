# 手工测试清单

本文档用于记录难以完全自动化的演示级流程。每次完成相关功能后，在结果栏记录日期、环境和结论。

当前基线：Day 11 已完成。出价 API、Redis Lua、封顶成交、防狙击延时、Socket.IO 房间隔离、outbox 广播、重连 snapshot、管理端创建商品 / 竞拍表单、管理端工作台和移动端真实 REST / Socket.IO 页面已有自动化、类型检查或构建检查；Day 10 核心闭环和 Day 11 异常场景已有 `pnpm test:e2e` 服务级覆盖，真实 MySQL/Redis/浏览器闭环、多窗口真实联动和正式压测仍需后续补测。

| 场景 | 前置条件 | 操作 | 预期结果 | 结果 |
| --- | --- | --- | --- | --- |
| 后台创建商品 | 已启动服务端，数据库已 seed `admin_1` | 在管理端“商品上架”表单填写商品名称、图片 URL、介绍和卖点，提交 | 返回 `201` 和商品 DTO，`sellingPoints` 被规范化保存；页面继续创建竞拍 | 2026-05-30：管理端页面已接入表单，`apps/admin` typecheck/build 通过；浏览器打开 `/admin/items/new` 表单渲染且无前端 error/warning；`pnpm test:e2e` 服务级闭环覆盖商品创建；真实浏览器提交待补测 |
| 后台创建 0 元起拍竞拍 | 已有 `room_1`，管理端表单中起拍价填 `0` | 在同一表单填写固定加价、时长、封顶价、防狙击窗口、延时时长和最大延时次数，提交 | 返回 `SCHEDULED` 竞拍，`currentPriceFen` 为 `0`，列表刷新后可启动 | 2026-05-30：页面转换整数分并调用 `POST /admin/auctions`，浏览器确认 0 元起拍和延时字段可见；`pnpm test:e2e` 服务级闭环覆盖竞拍创建、启动、用户端可见和成交订单 |
| 后台拒绝非法规则 | 已启动服务端 | 创建竞拍时传 `incrementFen: 0` 或 `capPriceFen <= startPriceFen` | 返回 `400 VALIDATION_FAILED`，错误字段稳定 | 单元测试已覆盖核心规则，接口待测 |
| 开拍后禁止改规则 | 已创建并启动竞拍 | 调用 `PATCH /admin/auctions/:id/rules` | 返回 `409 RULE_CANNOT_BE_CHANGED_AFTER_START` | 单元测试已覆盖核心规则，接口待测 |
| 后台取消竞拍 | 竞拍为 `SCHEDULED` 或 `RUNNING` | 调用 `POST /admin/auctions/:id/cancel` 并填写原因 | 状态变为 `CANCELLED`，返回取消原因和时间，写入 `AUCTION_CANCELLED` outbox | 2026-05-27：状态机单元测试覆盖取消 outbox；真实接口待 Docker 环境补测 |
| 无人出价到期流拍 | 已创建并启动竞拍，时长较短 | 不提交任何出价，等待到期 | 状态变为 `ENDED_UNSOLD`，不生成订单；outbox 产生并广播 `AUCTION_ENDED` | 2026-05-31：`day11-auction-scenarios.e2e.test.ts` 服务级 e2e 覆盖流拍和无订单；真实 timer 接口流程待测 |
| 单人出价成交 | 竞拍运行中 | 用户 A 提交有效出价，等待到期 | 状态变为 `ENDED_SOLD`，生成一个订单，买家为用户 A | 2026-05-31：Day 11 服务级 e2e 覆盖一人出价到期成交、订单生成和 snapshot 恢复；真实接口流程待测 |
| 多人连续出价 | 竞拍运行中，至少 2 个用户窗口 | 用户 A、B 交替按固定幅度出价 | 当前价单调递增，最高出价人唯一，被超越用户收到提醒 | 2026-05-31：Day 11 服务级 e2e 覆盖多人连续出价、当前价单调、最高价唯一和 snapshot 排名恢复；真实多窗口提示待补测 |
| 重复 clientBidId | 竞拍运行中 | 同一用户用相同 `clientBidId` 重复提交 | 不产生重复 Bid，返回幂等结果或 `DUPLICATE_CLIENT_BID` | 2026-05-31：Day 11 服务级 e2e 覆盖重复点击同一 `clientBidId` 返回幂等结果，不重复写 Bid / `BID_ACCEPTED` |
| 最后 N 秒自动延时 | 配置防狙击窗口和延时时长 | 在结束前 N 秒提交有效出价 | `endTime` 延后，广播 `AUCTION_EXTENDED`，旧 timer 不再结算 | 2026-05-31：Day 11 服务级 e2e 覆盖最后窗口内有效出价延长 `endTime` 并重排 timer；真实浏览器广播待补测 |
| 封顶价立即成交 | 配置封顶价 | 用户提交达到封顶价的有效出价 | 立即结算为 `ENDED_SOLD`，只生成一个订单 | 2026-05-31：Day 11 服务级 e2e 覆盖封顶立即成交、只生成一个订单、后续出价返回已结束 |
| 主播取消竞拍 | 竞拍 `SCHEDULED` 或 `RUNNING` | 后台点击取消并填写原因 | 状态变为 `CANCELLED`，本进程结束 timer 被清理；广播 `AUCTION_CANCELLED` | 2026-05-31：Day 11 服务级 e2e 覆盖运行中取消、取消事件和后续出价返回已取消；真实浏览器广播待补测 |
| 断线重连 snapshot 恢复 | 竞拍运行中且已有出价 | 断开移动端 WebSocket 后重连 | 重新拉取 snapshot，当前价、倒计时和领先状态正确 | 2026-05-31：Day 11 服务级 e2e 覆盖出价后 snapshot 当前价、最高出价人、我的排名和参与人数恢复；真实断网重连待补测 |
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
- 人为构造乱序 / 跳号事件，验证移动端页面按 `serverSeq` 丢弃旧事件并在跳号时重拉 snapshot。
- 真实 timer 到期或封顶成交后，移动端收到竞拍结束事件并禁用出价按钮。

## Day 7 自动化和页面检查

已覆盖：

- `apps/server/src/auction/auction-state-machine.service.test.ts` 覆盖取消竞拍写入 `AUCTION_CANCELLED` outbox。
- `apps/server/src/realtime/auction-event-publisher.service.test.ts` 继续覆盖取消事件广播到 `room:{roomId}` 和 `auction:{auctionId}`。
- `apps/admin` 类型检查覆盖管理端 API DTO 和页面状态。
- 浏览器打开 `http://localhost:5173/`，确认管理端标题、竞拍列表、订单 tab 渲染，无前端控制台错误。

待补真实环境检查：

- 2026-05-27：本机 Docker Desktop 未运行，无法启动 MySQL/Redis，因此浏览器里真实 API 返回 `Failed to fetch`；后续启动 Docker 后补测竞拍列表、启动、取消和订单列表。
- 2026-05-27：Docker 已启动后补测通过。`/health` 返回 DB/Redis `ok`；管理端页面真实加载 `GET /admin/auctions` 数据，无前端控制台错误；`POST /admin/auctions/auction_1/start` 成功进入 `RUNNING`；`GET /auctions/auction_1/snapshot` 初次联调发现 `RealtimeController` 未显式注入 `AuctionSnapshotService` 导致 500，已修复并补单元测试；`POST /admin/auctions/auction_1/cancel` 成功返回 `CANCELLED`；最后执行 seed 恢复 `auction_1` 为 `SCHEDULED`。

## Day 8 移动端 mock 页面检查

已覆盖：

- `apps/mobile` 类型检查覆盖直播间页面组件和 mock service 类型边界。
- `apps/mobile` production build 产物生成通过。
- 浏览器打开 `http://localhost:5174/`，确认主播信息、直播背景、评论流、底部互动区和竞拍小卡片渲染。
- 点击竞拍小卡片可打开底部半屏竞拍面板，关闭按钮和遮罩可关闭。
- 面板内 `+` / `-` 按固定加价幅度调整本次出价，金额不会低于下一口价或超过封顶价。
- 点击“立即出价”后本地 snapshot 更新当前价、我的出价、排名、评论流和 toast；当前用户领先时出价按钮禁用。
- 页面会触发一次本地模拟对手超越，展示“你已被超越”，并恢复可继续出价的状态。

## Day 9 移动端真实联动检查

已覆盖：

- `apps/mobile` 类型检查覆盖真实 REST service、Socket.IO client 封装和页面状态接入。
- `apps/mobile` production build 产物生成通过。
- 移动端进入直播间后会拉取真实 `GET /rooms/:roomId/auctions`、`GET /auctions/:auctionId` 和 `GET /auctions/:auctionId/snapshot`。
- 移动端提交真实 `POST /auctions/:auctionId/bids`，生成稳定 `clientBidId`，并展示后端错误消息。
- 移动端通过 Socket.IO 加入 `room:{roomId}`、`auction:{auctionId}`，请求 `AUCTION_SNAPSHOT`，并处理 `BID_ACCEPTED`、`LEADING`、`OUTBID`、`AUCTION_EXTENDED`、`AUCTION_ENDED`、`ORDER_CREATED` 和 `AUCTION_CANCELLED`。
- 移动端用 `serverTime` 校准倒计时，用 `serverSeq` 丢弃旧事件并在跳号时重新拉 snapshot。
- 2026-05-29：Docker MySQL/Redis、服务端和移动端 dev server 环境下，seed 后启动 `auction_1`，`user_1` 通过真实 HTTP 出价到 ¥10，浏览器打开 `http://localhost:5174/?userId=user_2` 拉取真实 snapshot，面板提交 ¥20 成功，页面更新当前价、排行榜、我的排名和领先禁用状态；浏览器 error/warning 日志为空。

待补真实环境检查：

- 打开 `http://localhost:5174/?userId=user_1` 和 `http://localhost:5174/?userId=user_2`，交替出价，验证当前价、排行榜、领先 / 被超越提示同步。
- 手动断开移动端网络或刷新页面，验证重连后 snapshot 恢复最新价格、倒计时和我的排名。
- 等待到期或冲击封顶价，验证竞拍结束后移动端禁用出价并展示成交 / 流拍状态。

## Day 10 管理端创建表单检查

已覆盖：

- `apps/admin` 类型检查覆盖创建表单状态、金额字符串转整数分、卖点解析和 API DTO 类型。
- `apps/admin` production build 产物生成通过。
- 浏览器打开 `http://localhost:5173/admin/items/new`，确认创建页核心字段渲染且前端 error/warning 日志为空。
- `pnpm test:e2e` 覆盖创建商品、创建 0 元起拍竞拍、启动竞拍、房间竞拍列表可见、封顶成交、后台订单列表可见。
- 管理端新增“商品上架” tab，路径 `/admin/items` 和 `/admin/items/new` 会进入创建页。
- 创建页覆盖商品名称、商品图片 URL、商品介绍、卖点标签、直播间 ID、起拍价、固定加价、竞拍时长、封顶价、防狙击窗口、延时时长和最大延时次数。
- 表单提交前会做轻量输入校验；后端仍负责最终规则校验和状态机兜底。

待补真实环境检查：

- 启动 MySQL、Redis、server 和 admin 后，通过页面创建新商品和 0 元起拍竞拍，确认列表出现 `SCHEDULED` 竞拍。
- 点击新竞拍“启动”，再打开移动端确认 `GET /rooms/:roomId/auctions` 能看到启动后的竞拍。
- 对新竞拍完成一次真实出价和结算，确认后台订单列表出现成交订单。

## Day 11 服务级异常场景覆盖

已通过 `apps/server/src/day11-auction-scenarios.e2e.test.ts` 覆盖：

- 无人出价到期后进入 `ENDED_UNSOLD`，订单数为 0。
- 一人有效出价到期后进入 `ENDED_SOLD`，生成唯一订单，snapshot 可恢复最高出价和我的排名。
- 多人连续出价后当前价单调递增，最高出价人唯一，参与人数和排行榜正确。
- 最高出价人再次出价返回 `BIDDER_ALREADY_LEADING`，用户消息为“当前您已是最高价”。
- 防狙击窗口内有效出价延长 `endTime` 并重排 timer。
- 达到封顶价立即成交，后续出价返回 `AUCTION_ALREADY_ENDED`。
- 主播取消运行中竞拍后写入 `AUCTION_CANCELLED`，后续出价返回 `AUCTION_CANCELLED`。
- 重复点击同一 `clientBidId` 返回幂等结果，不重复写入 Bid 或 `BID_ACCEPTED`。

仍需真实环境补测：

- Docker MySQL/Redis/server/admin/mobile 全链路下，通过管理端页面创建商品和竞拍，再用两个移动端窗口交替出价。
- 人为刷新或断开移动端 Socket.IO 后重连，观察页面是否以最新 snapshot 恢复。
- 真实浏览器收到 `AUCTION_EXTENDED`、`AUCTION_CANCELLED`、`AUCTION_ENDED` 后的 UI 禁用和提示效果。

## 记录格式

```txt
日期：
环境：
场景：
结果：
问题：
证据：
```
