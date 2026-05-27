# 开发进度

本文档替代早期 `day1-todo.md`。早期 Day 1 清单已过期，继续保留会把已完成的 Day 2-Day 4 工作误标为待办；后续统一在这里维护阶段状态和下一步入口。

## 当前状态

当前基线：Day 7 已完成。

已落地能力：

- pnpm monorepo、NestJS 服务端、Vite 管理端和移动端骨架。
- MySQL、Redis、Prisma schema、seed 和健康检查。
- 管理端商品 API、竞拍创建、规则修改、启动、取消。
- 集中的 `AuctionStateMachineService`，覆盖启动、取消、到期成交、到期流拍。
- 单机 `AuctionSchedulerService`，支持启动后注册结束 timer、取消清理 timer、服务启动恢复 `RUNNING` 竞拍 timer。
- 成交时在状态机事务内创建 `PENDING_PAYMENT` 订单，`Order(auctionId)` 唯一约束防重复。
- 管理端订单查询 API。
- 用户端出价 API：`POST /auctions/:auctionId/bids`。
- Redis Lua 原子出价热状态：当前价、最高出价人、结束时间、出价次数、排行榜和 `clientBidId` 热幂等键。
- 出价成功后写入 `Bid`、更新 `AuctionSession` 快照字段、写入 `AuctionEvent(BID_ACCEPTED, outboxStatus=PENDING)`。
- 达到封顶价立即通过状态机成交；防狙击窗口内有效出价延长 `endTime` 并重排本进程结束 timer。
- WebSocket / Socket.IO gateway，支持 `room:{roomId}`、`auction:{auctionId}`、`user:{userId}` 房间隔离。
- 用户端实时 REST：`GET /rooms/:roomId/auctions`、`GET /auctions/:auctionId`、`GET /auctions/:auctionId/snapshot`。
- `AuctionEventPublisherService` 从 `AuctionEvent(outboxStatus=PENDING)` 发布 `BID_ACCEPTED`、`LEADING`、`OUTBID`、`AUCTION_EXTENDED`、`AUCTION_STARTED`、`AUCTION_ENDED`、`ORDER_CREATED`、`AUCTION_CANCELLED`。
- outbox 成功发布后标记 `PUBLISHED`，发布失败时标记 `FAILED` 并写 `AuditLog(AUCTION_EVENT_PUBLISH_FAILED)`。
- 管理端后台工作台：竞拍列表、状态筛选、启动 / 取消操作、订单列表。
- 管理端竞拍和订单 API 返回后台展示需要的商品标签、商品图、买家脱敏名和竞拍状态。
- 核心规则、状态机、出价引擎、snapshot、gateway、outbox 发布和取消 outbox 单元测试。

尚未落地能力：

- Redis/DB 自动对账任务。
- 移动端真实页面联调。
- 压测脚本和真实性能数据；当前只有服务端单元级 30/100 并发测试。

## Day 1 已完成

- 创建 pnpm workspace。
- 创建 `apps/server` NestJS 骨架和 `/health` 健康检查。
- 创建 `apps/admin` 和 `apps/mobile` Vite React 骨架。
- 创建 `packages/shared`，沉淀竞拍状态、WebSocket 事件和错误码。
- 编写架构、API、WebSocket 事件文档初稿。

## Day 2 已完成

- 新增 `docker-compose.yml`，提供本地 MySQL 和 Redis。
- 引入 Prisma，建模用户、直播间、商品、规则、竞拍、出价、订单、事件和审计日志。
- 添加关键唯一约束：`Bid(auctionId, clientBidId)`、`Order(auctionId)`。
- 添加 Redis 服务边界。
- 补充 seed 脚本。
- 扩展 `/health`，检查数据库和 Redis 连接。

## Day 3 已完成

- 新增后台 demo 鉴权。
- 新增商品创建、列表、详情、修改 API。
- 新增竞拍创建、列表、详情、未开始规则修改、启动、取消 API。
- 新增竞拍规则校验：`0` 元起拍、固定加价大于 `0`、封顶价大于起拍价、开拍后禁止改规则。
- 新增最小状态机服务，集中处理启动和取消。
- 新增服务端单元测试。

## Day 4 已完成

- 扩展状态机结算能力：`finishAuction`、`settleSoldAuction`、`settleUnsoldAuction`。
- 到期时有最高出价人则成交，无最高出价人则流拍。
- 成交订单在状态机事务内创建，并依赖 `Order(auctionId)` 唯一约束兜底。
- 启动竞拍后注册单机结束 timer，取消和销毁模块时清理 timer。
- 服务启动时恢复 `RUNNING` 竞拍 timer；已过期的竞拍立即进入结算流程。
- 新增管理端订单列表和详情接口。
- 单元测试覆盖成交、流拍、未到结束时间拒绝、重复结束不重复建单。

## Day 5 已完成

- 新增 `BidModule`、`BidController`、`BidService` 和 `RedisBidAtomicStore`。
- `POST /auctions/:auctionId/bids` 已实现，用户端 demo 身份必须使用 `X-Demo-Role: bidder`。
- Redis Lua 原子校验并更新热状态，拒绝低价、非法步长、超过封顶价、最高出价人重复出价、过期竞拍和重复热幂等键。
- 服务层用 `Bid(auctionId, clientBidId)` 唯一约束兜底幂等；已存在 Bid 时返回原结果并标记 `idempotent: true`。
- 成功出价在 DB transaction 内写 `Bid`、更新 `AuctionSession`，并写 `AuctionEvent(BID_ACCEPTED, outboxStatus=PENDING)`。
- 达到 `capPriceFen` 后调用 `AuctionStateMachineService.settleSoldAuction` 立即成交，只生成一个订单。
- 防狙击窗口内有效出价延长 `endTime`，更新 `extendedCount`，并调用 `AuctionSchedulerService.scheduleEndTimer` 重排 timer。
- Redis accepted 但 DB 写失败时返回 `BID_PERSISTENCE_FAILED`，不广播成功，记录 `AuditLog(action=DB_WRITE_FAILED_AFTER_REDIS_ACCEPTED)`。
- 单元测试覆盖 0 元起拍后的有效出价、核心拒绝规则、重复 `clientBidId`、防狙击延时、封顶成交、并发封顶、30 和 100 并发出价。

## Day 6 已完成

- 新增 `RealtimeModule`，包含 `AuctionRealtimeGateway`、`AuctionSnapshotService`、`AuctionEventPublisherService` 和 `RealtimeController`。
- 服务端 Socket.IO 连接支持 demo 身份 `auth: { userId, role }`，连接后自动加入 `user:{userId}`。
- 支持客户端事件：`joinRoom`、`joinAuction`、`leaveAuction`、`requestSnapshot`、`placeBid`、`PING`。
- `requestSnapshot` 和 `GET /auctions/:auctionId/snapshot` 返回包含 `serverTime`、`serverSeq`、排行榜、当前用户最高出价和排名的快照。
- 状态机启动、取消、成交/流拍和订单创建会写入 outbox 事件。
- `AuctionEventPublisherService` 轮询 `PENDING` outbox，按房间定向广播，成功标记 `PUBLISHED`，失败标记 `FAILED` 并记录审计日志。
- `BID_ACCEPTED` 会广播到 `auction:{auctionId}`，并向新领先用户发送 `LEADING`，向旧最高出价人发送 `OUTBID`；触发延时时额外广播 `AUCTION_EXTENDED`。
- WebSocket 出价失败时通过 `user:{userId}` 发送 `BID_REJECTED`，HTTP 出价仍以 API 错误响应为准。
- 单元测试覆盖房间加入、重连 snapshot、`BID_ACCEPTED` 房间隔离、`LEADING` / `OUTBID` 私有提醒、发布失败留痕。

## Day 7 已完成

- 管理端从 Day 1 占位页面升级为主播工作台。
- `GET /admin/auctions` 列表补齐 `itemSellingPoints`，详情商品摘要补齐 `sellingPoints`。
- `GET /admin/orders` 和 `GET /admin/orders/:orderId` 补齐 `itemName`、`itemImageUrl`、`buyerMaskedName`、`auctionStatus`。
- 竞拍列表展示商品图、商品名、标签、起拍价、固定加价、封顶价、当前价 / 成交金额、出价次数、状态、剩余时间和操作按钮。
- 管理端可按竞拍状态筛选，可启动 `SCHEDULED` 竞拍，可取消 `SCHEDULED` / `RUNNING` 竞拍。
- 订单列表展示商品、订单、买家、成交金额、订单状态和创建时间。
- 新增状态机单元测试覆盖取消竞拍写入 `AUCTION_CANCELLED` outbox；Day 6 发布器测试继续覆盖取消事件广播到 `room:{roomId}` 和 `auction:{auctionId}`。
- 浏览器打开 `http://localhost:5173/` 验证页面渲染、核心文案和无前端控制台错误。

## Day 8 下一步

进入移动端直播间主页面：

- 移动端直播间主页面、模拟直播画面、评论流、竞拍小卡片和底部半屏面板。
- 本地 mock 出价交互和出价步进器，为 Day 9 接入真实 REST / Socket.IO 做组件边界。
- 移动端不要重复实现服务端状态机，所有状态文案后续以 snapshot / API 为准。

Day 8 的主要风险：

- 移动端 UI 需要移动优先，按钮和金额信息不能拥挤或遮挡。
- 本地 mock 只能用于交互骨架，不能写成真实竞拍能力。
- Day 7 管理端浏览器真实 API 联调受阻：本机 Docker Desktop 未运行，MySQL/Redis 未启动，后续需要补一次真实环境手测。
- 当前 outbox 发布器是单进程轮询，未来多实例会有重复发布风险，需要引入 claim 状态或分布式锁。

## 文档维护规则

- `README.md` 只保留快速启动、当前阶段和核心入口。
- `docs/README.md` 作为文档目录索引。
- `docs/api.md`、`docs/websocket-events.md` 记录目标契约时，必须标明未实现能力。
- `docs/manual-test.md` 只记录可执行的手工流程；未到开发阶段的流程标注为待后续实现后补测。
- `docs/performance-report.md` 不编造压测数据；未执行时写明原因。
- `docs/ai-codex-log.md` 每次实质文档或代码变更都要记录。
