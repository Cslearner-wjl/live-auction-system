# 直播竞拍全栈系统

面向抖音直播电商场景的全栈竞拍系统，覆盖：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单 -> 模拟支付
```

当前基线已实现本地演示闭环：管理后台、移动端 H5、NestJS API、Socket.IO 实时事件、Redis Lua 原子出价、Redis 分布式锁、outbox claim/lease/死信、Redis/DB 对账审计、真实 HTTP 30/100 并发压测、生产 Docker Compose 和 CI。

## 技术栈

- Monorepo：pnpm workspace
- 前端：React + TypeScript + Vite
- 后端：Node.js + TypeScript + NestJS
- 数据库：MySQL + Prisma
- 缓存 / 并发：Redis
- 实时通道：Socket.IO
- 测试：Node test runner、服务级 e2e、压测脚本
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
  final-acceptance.md
  demo-script.md
  architecture.md
  consistency.md
  api.md
  websocket-events.md
  database-schema.md
  error-codes.md
  manual-test.md
  performance-report.md
  final-deployment-plan.md
  ai-codex-log.md
```

## 本地启动

安装依赖：

```powershell
pnpm install
```

启动 MySQL 和 Redis：

```powershell
docker compose up -d mysql redis
```

生成 Prisma Client：

```powershell
pnpm --filter @live-auction/server prisma:generate
```

执行迁移和 seed：

```powershell
pnpm --filter @live-auction/server prisma:migrate
pnpm --filter @live-auction/server prisma:seed
```

分别启动三端：

```powershell
pnpm dev:server
pnpm dev:admin
pnpm dev:mobile
```

常用地址：

| 入口 | 地址 |
| --- | --- |
| 后端健康检查 | `http://localhost:3000/health` |
| 管理后台 | `http://localhost:5173/admin/items/new` |
| 移动端用户 A | `http://localhost:5174/?roomId=room_1&userId=user_1&auctionId=<auctionId>` |
| 移动端用户 B | `http://localhost:5174/?roomId=room_1&userId=user_2&auctionId=<auctionId>` |

## 生产 Compose 演示

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

默认端口：

- server: `http://localhost:3000`
- admin: `http://localhost:8080`
- mobile: `http://localhost:8081`
- mysql host port: `13307`
- redis host port: `16379`

`docker-compose.prod.yml` 会在 server 启动前执行 Prisma migrate deploy 和 seed，适合本地一键演示。生产 compose 默认使用 `13307/16379` 暴露 MySQL/Redis，避免和 dev compose 的 `3307/6379` 冲突。真实生产环境应拆分迁移步骤，替换 demo 身份、默认数据库密码和公网 CORS 配置。

## 验证命令

```powershell
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
```

真实 HTTP 并发压测：

```powershell
pnpm perf:day12
$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS
```

Socket.IO 连接压测入口：

```powershell
pnpm perf:socket
$env:SOCKET_CONNECTIONS='1000'; pnpm perf:socket; Remove-Item Env:SOCKET_CONNECTIONS
```

当前已记录 HTTP 30/100 并发出价结果，以及 Socket.IO 100/1000 连接压测结果。

## 环境变量

复制 `.env.example` 到 `.env` 后填写本地配置。真实密钥只允许放在 `.env`，不得提交。

主要变量：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | Prisma MySQL 连接 |
| `REDIS_URL` | Redis 连接 |
| `ADMIN_WEB_URL` / `MOBILE_WEB_URL` | 本地 CORS 来源 |
| `BID_LOCK_*` | Redis 出价锁配置 |
| `OUTBOX_*` | outbox claim / retry 配置 |
| `AUCTION_CONSISTENCY_*` | Redis/DB 对账审计配置 |

## 本地图片上传

管理后台“商品上架”支持选择本地 `jpg/png/webp/gif` 图片。图片会上传到服务端静态目录，并自动填入类似下面的 URL：

```txt
http://localhost:3000/uploads/items/<file>.jpg
```

单张图片解码后最大 3MB；该能力用于本地演示，真实生产应接入对象存储或 CDN。

## 核心文档

- `docs/final-acceptance.md`：最终演示验收材料。
- `docs/demo-script.md`：5 分钟演示脚本。
- `docs/architecture.md`：系统架构和模块边界。
- `docs/api.md`：REST API 契约。
- `docs/websocket-events.md`：WebSocket / Socket.IO 事件契约。
- `docs/performance-report.md`：真实压测数据和待补指标。
- `docs/manual-test.md`：最终手工测试清单。

## 当前限制

- 当前身份是 demo header / query 参数模拟，不适合公网生产。
- 结束调度仍是单机 timer，多实例部署应切换到 Redis delayed queue、BullMQ 或等价方案。
- 对账 worker 只检测并写审计，不自动修复价格、赢家、订单或状态。
- Playwright 浏览器全链路和生产 compose 新环境实跑仍待补。
- 真实支付、真实直播推流和 AI 卖点生成不在当前主流程完成范围内。
