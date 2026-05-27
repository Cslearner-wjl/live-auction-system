# 直播竞拍全栈系统

面向抖音直播电商场景的全栈竞拍系统，目标是完成：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单
```

当前处于 Day 7：服务端出价 API、Redis Lua 原子出价、幂等、封顶成交、防狙击延时、WebSocket 房间隔离、断线重连 snapshot、outbox 广播发布和主播端管理后台联调已落地；移动端真实页面联动和正式压测仍在后续范围。

## 技术栈

- Monorepo：pnpm workspace
- 移动端 H5：React + TypeScript + Vite
- PC 管理后台：React + TypeScript + Vite
- 后端：Node.js + TypeScript + NestJS
- 共享契约：`packages/shared`
- 数据库：MySQL + Prisma
- 缓存与并发：Redis
- 实时通信：Socket.IO / WebSocket
- 部署：Docker Compose

## 项目结构

```txt
apps/
  admin/          # PC 管理后台
  mobile/         # 移动端 H5 直播间
  server/         # 后端 API 和实时服务
packages/
  shared/         # 共享状态、事件名、错误码、DTO 类型
docs/
  README.md
  progress.md
  architecture.md
  api.md
  websocket-events.md
  manual-test.md
  performance-report.md
  demo-script.md
  requirements-analysis.md
  tech-stack-constraints.md
  development-process.md
  ai-codex-log.md
  database-schema.md
  consistency.md
  error-codes.md
```

## 本地启动

安装依赖：

```bash
pnpm install
```

启动 MySQL 和 Redis：

```bash
docker compose up -d mysql redis
```

本地 MySQL 使用 8.0 系列并启用 `mysql_native_password`，用于规避 MySQL 8.4 默认认证插件与当前 Prisma schema engine 的兼容问题。
如果本机已经安装 MySQL，项目 Docker MySQL 暴露在 `127.0.0.1:3307`，容器内仍使用默认 `3306`。

生成 Prisma Client：

```bash
pnpm --filter @live-auction/server prisma:generate
```

执行数据库迁移和 seed：

```bash
pnpm --filter @live-auction/server prisma:migrate -- --name init
pnpm --filter @live-auction/server prisma:seed
```

启动服务端：

```bash
pnpm dev:server
```

启动后台：

```bash
pnpm dev:admin
```

启动移动端：

```bash
pnpm dev:mobile
```

运行基础校验：

```bash
pnpm typecheck
pnpm build
pnpm test
```

服务端健康检查：

```bash
curl http://localhost:3000/health
```

## 环境变量

复制 `.env.example` 到 `.env` 后填写本地配置。真实密钥只允许放在 `.env`，不得提交。

## Day 1 完成内容

- 创建 pnpm monorepo。
- 创建 `apps/server` NestJS 骨架和 `/health` 健康检查。
- 创建 `apps/admin` 和 `apps/mobile` Vite React 骨架。
- 创建 `packages/shared`，沉淀竞拍状态、WebSocket 事件和错误码。
- 补齐架构、API、WebSocket 事件和进度追踪文档。

## Day 2 完成内容

- 新增 `docker-compose.yml`，提供本地 MySQL 和 Redis。
- 新增 Prisma schema，覆盖用户、直播间、商品、规则、竞拍、出价、订单、事件和审计日志。
- 新增 Prisma seed，创建 `admin_1`、`user_1`、`user_2`、`room_1`、`item_1`、`auction_1` 演示数据。
- 后端接入 Prisma 和 Redis 服务边界。
- `/health` 返回服务、数据库和 Redis 状态。

## Day 3 完成内容

- 新增后台 demo 鉴权，`/admin/*` 需要 `X-Demo-User-Id` 和 `X-Demo-Role: admin`。
- 新增商品 API：创建、分页列表、详情、修改。
- 新增竞拍 API：创建竞拍和规则、分页列表、详情、修改未开始规则、启动、取消。
- 新增规则校验：`0` 元起拍、固定加价大于 `0`、封顶价大于起拍价、开拍后禁止修改规则。
- 新增最小 `AuctionStateMachineService`，集中处理 Day 3 的启动和取消状态流转。
- 新增服务端单元测试，覆盖 Day 3 核心规则和状态流转。

## Day 4 完成内容

- 扩展 `AuctionStateMachineService.finishAuction`，支持到期成交和流拍结算。
- 有最高出价人时创建 `PENDING_PAYMENT` 订单；无人出价时流拍且不生成订单。
- 订单创建在状态机事务内完成，并由 `Order(auctionId)` 唯一约束防止重复订单。
- 新增 `AuctionSchedulerService`，启动竞拍后注册单机结束 timer，服务启动时恢复 `RUNNING` 竞拍的 timer。
- 取消竞拍时清理本进程结束 timer。
- 新增管理端订单查询 API：`GET /admin/orders`、`GET /admin/orders/:orderId`。
- 新增状态机单元测试，覆盖成交、流拍、未到结束时间拒绝、重复结束不重复建单。

## Day 5 完成内容

- 新增用户端出价 API：`POST /auctions/:auctionId/bids`，使用 `X-Demo-Role: bidder` demo 身份。
- 新增 Redis Lua 原子出价路径，维护当前价、最高出价人、结束时间、出价次数、排行榜和 `clientBidId` 热幂等键。
- 出价服务落库 `Bid`，更新 `AuctionSession` 快照字段，并写入 `AuctionEvent(BID_ACCEPTED, outboxStatus=PENDING)`。
- 支持固定加价校验、最高出价人不可重复出价、封顶价校验、重复 `clientBidId` 幂等兜底。
- 达到 `capPriceFen` 后调用状态机立即成交，并继续依赖 `Order(auctionId)` 唯一约束防重复订单。
- 结束前防狙击窗口内有效出价会延长 `endTime` 并重排本进程结束 timer。
- 新增服务端单元测试，覆盖 30 和 100 并发出价、重复 `clientBidId`、并发封顶、延时和核心拒绝规则。

## Day 6 完成内容

- 新增 `RealtimeModule`，提供 Socket.IO gateway、实时 REST 查询和 outbox 发布器。
- WebSocket 连接使用 demo 身份加入 `user:{userId}`，支持 `joinRoom`、`joinAuction`、`leaveAuction`、`requestSnapshot`、`placeBid` 和 `PING`。
- 新增 `GET /rooms/:roomId/auctions`、`GET /auctions/:auctionId`、`GET /auctions/:auctionId/snapshot`，snapshot 包含 `roomId`、`serverTime`、`serverSeq`、排行榜和当前用户排名。
- 状态机在启动、取消、成交/流拍和订单创建时写入 `AuctionEvent` outbox。
- `AuctionEventPublisherService` 轮询 `PENDING` 事件，按 `room:{roomId}`、`auction:{auctionId}`、`user:{userId}` 定向广播，并在成功后标记 `PUBLISHED`，失败时标记 `FAILED` 并写审计日志。
- `BID_ACCEPTED` outbox 会拆分广播 `BID_ACCEPTED`、`LEADING`、`OUTBID`，触发延时时同时广播 `AUCTION_EXTENDED`。
- 新增服务端单元测试，覆盖房间加入、重连 snapshot、outbox 房间隔离、私有提醒和发布失败留痕。

## Day 7 完成内容

- 管理端从 Day 1 骨架升级为可用后台工作台。
- 竞拍列表接入 `GET /admin/auctions`，支持状态筛选、刷新、启动竞拍和取消异常竞拍。
- 竞拍列表展示商品图、商品名、卖点标签、起拍价、固定加价、封顶价、当前价 / 成交金额、出价次数、竞拍状态和剩余时间。
- 订单列表接入 `GET /admin/orders`，展示订单 ID、竞拍 ID、商品、买家、成交金额、订单状态和创建时间。
- 管理端订单 API 追加商品名、商品图、买家脱敏名和竞拍状态字段，便于后台列表展示。
- 补充取消竞拍写入 `AUCTION_CANCELLED` outbox 的单元测试，延续 Day 6 发布器房间隔离覆盖。
- 文档、AI 协作日志和本地学习文档同步到 Day 7。

## 当前限制

- 移动端仍是骨架占位，尚未接入真实 REST / Socket.IO 事件。
- 管理端已接入真实 API，但本轮本机 Docker Desktop 未运行，真实 MySQL/Redis 环境下的浏览器联调待补测。
- 当前结束调度是 MVP 单机 timer，多实例部署需要切换到 Redis delayed queue 或 BullMQ。
- Redis accepted 但 DB 写失败时暂按 MVP 补偿策略处理：不广播成功，记录审计日志，后续需要实现 Redis/DB 对账任务。
- 封顶成交会让数据库 `serverSeq` 继续推进到结束和订单事件；Redis 热状态中的 seq/status 暂不反向同步，后续对账任务需要覆盖。
- 真实性能压测脚本和报告仍需补充；当前只有服务端单元级并发测试。
