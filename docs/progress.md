# 开发进度

本文档替代早期 `day1-todo.md`。早期 Day 1 清单已过期，继续保留会把已完成的 Day 2-Day 4 工作误标为待办；后续统一在这里维护阶段状态和下一步入口。

## 当前状态

当前基线：Day 9 已完成。

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
- 移动端直播间页面：主播信息、直播画面、评论流、底部互动区、竞拍小卡片和底部半屏竞拍面板。
- 移动端真实 REST service：加载房间竞拍列表、竞拍详情、snapshot，提交 HTTP 出价并展示后端错误消息。
- 移动端真实 Socket.IO 联动：连接后加入 `room:{roomId}`、`auction:{auctionId}`，请求 snapshot，处理出价、领先、被超越、延时、结束、订单和取消事件。
- 移动端以服务端 `serverTime` 校准倒计时，以 `serverSeq` 丢弃旧事件并在跳号时重新拉取 snapshot。
- 核心规则、状态机、出价引擎、snapshot、gateway、outbox 发布和取消 outbox 单元测试。

尚未落地能力：

- Redis/DB 自动对账任务。
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

## Day 8 已完成

- 移动端从 Day 1 占位页面升级为直播间主体验。
- 页面包含主播信息、关注按钮、在线人数、模拟直播画面、评论流、底部输入 / 购物车 / 点赞区。
- 右下竞拍小卡片展示商品图、起拍价 / 当前最高价 / 落槌价、倒计时和出价次数。
- 点击小卡片可打开底部半屏竞拍面板，面板展示商品详情、卖点、当前价、起拍价、固定加价、封顶价、延时规则、我的出价状态和实时排名。
- 本地 mock 出价支持 `+` / `-` 按固定加价幅度调整金额，按钮会在提交中、已结束、当前用户领先时禁用。
- 出价成功后展示“出价成功，当前您已领先”，并在评论流和排行榜中更新本地快照；页面会触发一次模拟对手超越并提示“你已被超越”。
- 倒计时进入最后 10 秒时增强视觉提示；倒计时结束后本地状态进入成交或流拍展示。
- 新增 `apps/mobile/src/mobile-auction-service.ts`，保留与 `AuctionSnapshot` 对齐的 mock 数据和本地出价计算边界。

Day 8 的主要风险和边界：

- Day 8 阶段移动端仍是 mock service，本地出价只用于交互骨架，不代表服务端真实出价或成交。
- 页面根据 snapshot 形状和本地状态展示，不复制服务端竞拍状态机；Day 9 已替换为服务端 snapshot / event。
- 使用外部图片 URL 作为演示视觉资产，离线或网络受限时可能只影响图片展示，不影响核心交互。

## Day 9 已完成

- 首次进入直播间调用 `GET /rooms/:roomId/auctions`、`GET /auctions/:auctionId` 和 `GET /auctions/:auctionId/snapshot`，用服务端 `serverTime` 校准倒计时。
- `mobile-auction-service.ts` 已从 mock 数据替换为真实 REST service，保留 `AuctionSnapshot` 作为页面状态入口。
- 新增 `socket.io-client`，移动端连接后加入 `room:{roomId}`、`auction:{auctionId}`，并通过 `requestSnapshot` 做首次同步和重连恢复。
- 页面按 `serverSeq` 丢弃旧事件，发现跳号时重新拉取 snapshot。
- 出价按钮提交 `POST /auctions/:auctionId/bids`，生成稳定 `clientBidId`，并展示后端错误码消息。
- 移动端处理 `BID_ACCEPTED`、`LEADING`、`OUTBID`、`AUCTION_EXTENDED`、`AUCTION_ENDED`、`ORDER_CREATED`、`AUCTION_CANCELLED` 和 `BID_REJECTED`。
- 竞拍未开始、已结束、已取消、当前用户领先或本地提交中时，出价按钮禁用。
- 支持通过 URL 查询参数 `roomId`、`userId`、`apiBaseUrl`、`socketUrl` 切换演示直播间、演示用户和服务端地址。
- 修复 Redis Lua 首次初始化热状态时未继承 DB `serverSeq` 的问题，避免启动事件后第一口出价和 `AUCTION_STARTED` 产生 `auctionId + serverSeq` 冲突。
- 修复 demo seed 重置不清理历史 Bid/Order/AuctionEvent/AuditLog 和 Redis 热 key 的问题，保证 `auction_1` 可重复 seed、启动和出价联调。

Day 9 的主要风险和边界：

- 移动端真实联动依赖服务端、MySQL 和 Redis 已启动，且竞拍已由后台启动为 `RUNNING`；`SCHEDULED` 状态只展示并禁用出价。
- 当前移动端主出价路径是 HTTP `POST /auctions/:auctionId/bids`，Socket.IO `placeBid` 仍作为服务端能力保留。
- 前端 `serverSeq` 防乱序只保护 UI 应用顺序；业务一致性仍依赖 Redis Lua、DB transaction 和唯一约束。
- 真实多窗口浏览器联调、断网重连手测和端到端测试仍需补充。
- 当前 outbox 发布器是单进程轮询，未来多实例会有重复发布风险，需要引入 claim 状态或分布式锁。

## Day 10 下一步

进入 PC 主播后台创建商品和竞拍表单：

- 新增商品创建入口，支持商品名称、图片 URL、描述和卖点。
- 新增竞拍规则配置表单，支持 0 元起拍、固定加价、竞拍时长、封顶价、防狙击窗口、延时时长和最大延时次数。
- 表单提交后创建商品和竞拍，列表可立即看到新竞拍。
- 保持规则合法性仍由后端校验和状态机兜底，前端只做输入辅助。
- 可选补充 AI 卖点按钮，但不得阻塞商品和竞拍主流程。

## 文档维护规则

- `README.md` 只保留快速启动、当前阶段和核心入口。
- `docs/README.md` 作为文档目录索引。
- `docs/api.md`、`docs/websocket-events.md` 记录目标契约时，必须标明未实现能力。
- `docs/manual-test.md` 只记录可执行的手工流程；未到开发阶段的流程标注为待后续实现后补测。
- `docs/performance-report.md` 不编造压测数据；未执行时写明原因。
- `docs/ai-codex-log.md` 每次实质文档或代码变更都要记录。
