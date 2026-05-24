# 直播竞拍全栈系统

面向抖音直播电商场景的全栈竞拍系统，目标是完成：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单
```

当前处于 Day 4：竞拍启动、单机定时结束、成交/流拍结算和管理端订单查询已落地。

## 技术栈

- Monorepo：pnpm workspace
- 移动端 H5：React + TypeScript + Vite
- PC 管理后台：React + TypeScript + Vite
- 后端：Node.js + TypeScript + NestJS
- 共享契约：`packages/shared`
- 数据库：MySQL + Prisma
- 缓存与并发：Redis
- 实时通信：WebSocket / Socket.IO，后续按实现确定
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
  architecture.md
  api.md
  websocket-events.md
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
- 补齐架构、API、WebSocket 事件和 Day 1 TODO 文档。

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

## 当前限制

- 尚未实现用户端出价接口、Redis 原子并发出价和 WebSocket 网关。
- 当前页面是骨架占位，用于验证工程结构。
- 当前结束调度是 MVP 单机 timer，多实例部署需要切换到 Redis delayed queue 或 BullMQ。
- 出价、Redis 原子并发和断线重连快照将在后续 Day 5-Day 6 逐步实现。
