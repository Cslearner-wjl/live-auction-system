# AI Codex 使用日志

## 2026-05-21

| 字段 | 内容 |
| --- | --- |
| task | 基于 PDF 初始化需求、技术栈约束、开发流程文档，并中文化 `AGENTS.md` |
| prompt summary | 用户要求根据 `ChatGPT-直播竞拍全栈开发.pdf` 输出需求分析、技术栈约束、开发流程 Markdown 文件，并将 `AGENTS.md` 改成中文 |
| files changed | `AGENTS.md`、`docs/requirements-analysis.md`、`docs/tech-stack-constraints.md`、`docs/development-process.md`、`docs/ai-codex-log.md` |
| AI-generated parts | PDF 文本提取、文档结构整理、中文项目规范重写 |
| human-reviewed decisions | 不复写课题材料中的真实 API Key；将 PDF 中的 `EXTENDED` 处理方式调整为“延时更新 `endTime`，不新增持久状态”；优先保留状态机、幂等出价、WebSocket 房间隔离、断线快照恢复等高价值约束 |
| tests run | 文档任务，无单元测试；执行文件存在性和敏感信息检查 |
| known issues | 当前仓库尚未初始化代码工程；原始课题材料中仍包含共享密钥，后续初始化 Git 前建议脱敏或加入提交排除策略 |

## 2026-05-21

| 字段 | 内容 |
| --- | --- |
| task | Day 1 开发：初始化 pnpm monorepo 工程骨架和文档基线 |
| prompt summary | 用户确认明文 API Key 已删除，并要求开始 Day 1 开发 |
| files changed | `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.gitignore`、`.env.example`、`README.md`、`apps/admin/*`、`apps/mobile/*`、`apps/server/*`、`packages/shared/*`、`docs/architecture.md`、`docs/api.md`、`docs/websocket-events.md`、`docs/day1-todo.md` |
| AI-generated parts | monorepo 骨架、NestJS 健康检查、Vite React 占位应用、共享枚举和事件契约、Day 1 架构/API/WebSocket 文档 |
| human-reviewed decisions | Day 1 不实现具体竞拍业务逻辑；`EXTENDED` 不作为持久状态；共享包先沉淀状态、事件、错误码和 snapshot 类型；真实密钥只允许放 `.env` |
| tests run | `pnpm install`、`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm lint`；启动后端、后台和移动端开发服务并验证 `/health`、`http://localhost:5173`、`http://localhost:5174` 返回 200 |
| known issues | 数据库、Redis、Prisma schema、WebSocket Gateway 和竞拍业务接口留到 Day 2 以后实现 |

## 2026-05-22

| 字段 | 内容 |
| --- | --- |
| task | 固化 docs 契约并同步 shared 错误码、WebSocket 事件元信息和 snapshot 序列字段 |
| prompt summary | 用户要求评判并落地文档优化建议，把 API、数据库、错误码、一致性、WebSocket 顺序、调度机制、开发流程、手测和演示文档前置补齐 |
| files changed | `docs/api.md`、`docs/architecture.md`、`docs/websocket-events.md`、`docs/development-process.md`、`docs/database-schema.md`、`docs/error-codes.md`、`docs/consistency.md`、`docs/manual-test.md`、`docs/demo-script.md`、`docs/performance-report.md`、`docs/ai-codex-log.md`、`packages/shared/src/error-codes.ts`、`packages/shared/src/websocket-events.ts`、`packages/shared/src/snapshot.ts` |
| AI-generated parts | API DTO 和错误响应契约、数据库字段和索引说明、错误码全集、Redis/DB/outbox 一致性策略、WebSocket `serverSeq` 乱序处理规则、手测和演示模板 |
| human-reviewed decisions | 默认 MySQL + Prisma；demo 鉴权固定为 `X-Demo-User-Id` 和 `X-Demo-Role`；MVP 定时结束先用单机 timer 并靠 DB 条件更新和订单唯一约束兜底；性能报告只放模板，不编造压测数据 |
| tests run | `pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm lint`；错误码 enum 与 `docs/error-codes.md` 表格一致性检查；旧错误码和敏感信息模式检查 |
| known issues | 本轮只固化契约和 shared 类型，不实现业务 API、Prisma schema、Redis Lua 或 WebSocket Gateway；`pnpm test` 和 `pnpm lint` 当前没有具体包级测试或 lint 脚本输出 |

## 2026-05-22

| 字段 | 内容 |
| --- | --- |
| task | Day 2 开发：数据库模型、Docker Compose、本地 seed、Prisma/Redis 连接和健康检查 |
| prompt summary | 用户要求根据文档完成 Day 2 任务，即让后端具备 MySQL 和 Redis 连接能力，补齐 ORM schema、Docker 环境和 seed |
| files changed | `docker-compose.yml`、`.env.example`、`README.md`、`apps/server/package.json`、`apps/server/prisma/*`、`apps/server/src/app.module.ts`、`apps/server/src/health/health.controller.ts`、`apps/server/src/prisma/*`、`apps/server/src/cache/*`、`docs/ai-codex-log.md` |
| AI-generated parts | Prisma schema、demo seed、Docker Compose、PrismaService、RedisService、扩展健康检查响应、Day 2 启动说明 |
| human-reviewed decisions | 保持 MySQL + Prisma；使用 Prisma 7 要求的 `prisma.config.ts` 和 `@prisma/adapter-mariadb`；`/health` 在 DB/Redis 不可用时返回 `degraded` 而不是让服务启动失败；Day 2 不实现业务 CRUD |
| tests run | `pnpm --filter @live-auction/server prisma:generate`、`pnpm --filter @live-auction/server exec prisma validate --schema prisma/schema.prisma`、seed TypeScript 编译检查、`docker compose --project-name live-auction config`、`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm lint`、启动后端并请求 `/health` |
| known issues | Docker Desktop Linux engine 未启动，`docker compose --project-name live-auction up -d mysql redis` 无法拉起容器，因此未执行真实 MySQL migration 和 seed；`/health` 在依赖未启动时按预期返回 `degraded`；`pnpm test` 和 `pnpm lint` 当前没有具体包级测试或 lint 脚本输出 |

## 2026-05-22

| 字段 | 内容 |
| --- | --- |
| task | 修复本地 Docker MySQL/Prisma 启动链路并完成真实 migration、seed、健康检查 |
| prompt summary | 用户已完成镜像拉取并询问下一步；执行本地依赖启动、Prisma 初始化和服务端健康检查 |
| files changed | `docker-compose.yml`、`.env.example`、`.env`、`README.md`、`apps/server/prisma.config.ts`、`apps/server/prisma/seed.ts`、`apps/server/src/prisma/prisma.service.ts`、`apps/server/src/health/health.controller.ts`、`apps/server/prisma/migrations/20260522035658_init/migration.sql`、`docs/ai-codex-log.md` |
| AI-generated parts | MySQL 8.0 本地兼容配置、3307 端口规避本机 MySQL 冲突、Prisma seed adapter 初始化、显式 Nest DI 注入、初始化 migration |
| human-reviewed decisions | 不删除已有 `live-auction_mysql-data` 旧数据卷，改用 `mysql80-data` 新卷；本地 Docker MySQL 使用 `127.0.0.1:3307`，避免连到 Windows 本机 `mysqld:3306`；`mysql_native_password` 仅作为本地开发兼容方案 |
| tests run | `docker compose up -d mysql redis`、`pnpm install --force`、`pnpm --filter @live-auction/server prisma:generate`、`pnpm --filter @live-auction/server prisma:migrate -- --name init`、`pnpm --filter @live-auction/server prisma:seed`、`pnpm --filter @live-auction/server typecheck`、启动服务端并请求 `/health` 返回 `status: ok`、`pnpm typecheck`、`pnpm test` |
| known issues | `pnpm test` 当前没有包级测试输出；本机已有 MySQL 占用 3306，后续本项目应继续使用 3307 或先停止本机 MySQL；MySQL 8.0 的 `default_authentication_plugin` 已 deprecated，仅用于本地开发兼容当前 Prisma engine |

## 2026-05-23

| 字段 | 内容 |
| --- | --- |
| task | Day 3 开发：主播端商品发布与竞拍规则配置 API |
| prompt summary | 用户要求完成 Day 3 任务并更新文档 |
| files changed | `apps/server/src/common/*`、`apps/server/src/admin/*`、`apps/server/src/auction/*`、`apps/server/src/app.module.ts`、`apps/server/package.json`、`README.md`、`docs/api.md`、`docs/manual-test.md`、`docs/ai-codex-log.md` |
| AI-generated parts | 管理端 demo 鉴权、统一 API 异常、分页解析、商品 CRUD、竞拍创建/列表/详情/规则修改/启动/取消、规则校验单元测试、状态流转单元测试、Day 3 文档更新 |
| human-reviewed decisions | Day 3 不引入 class-validator 或 Vitest，使用显式校验函数和现有 `tsx` 运行 Node 内置测试；启动和取消先进入 `AuctionStateMachineService`，后续 Day 4 扩展结束和结算；本轮不实现 Redis 热状态、WebSocket 广播和订单结算 |
| tests run | `pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/server test`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、启动服务端并请求 `/health`、`GET /admin/items`、非法规则 `POST /admin/auctions` 返回 `VALIDATION_FAILED` |
| known issues | Day 3 启动竞拍只更新数据库状态和时间，不初始化 Redis 热状态、不安排结束 timer、不广播 WebSocket 事件；取消竞拍只返回接口响应，取消事件广播待 WebSocket 网关实现；订单查询、AI 卖点接口和 E2E 测试脚本尚未实现 |

## 2026-05-24

| 字段 | 内容 |
| --- | --- |
| task | Day 4 开发：竞拍状态机结束结算、单机定时结束机制和管理端订单查询 |
| prompt summary | 用户要求完成 Day 4 工作并更新文档 |
| files changed | `apps/server/src/auction/*`、`apps/server/src/admin/*`、`packages/shared/src/*`、`README.md`、`docs/api.md`、`docs/architecture.md`、`docs/manual-test.md`、`docs/demo-script.md`、`docs/ai-codex-log.md` |
| AI-generated parts | `finishAuction` 成交/流拍事务结算、`AuctionSchedulerService` 单机 timer 和启动恢复扫描、管理端订单查询接口、订单状态共享枚举、状态机单元测试、Day 4 文档更新 |
| human-reviewed decisions | Day 4 只落地 DB 权威状态和单机 timer，不提前实现 Redis 热状态、出价 API、事件 outbox 或 WebSocket 广播；订单创建放在状态机事务内，并继续依赖 `Order(auctionId)` 唯一约束防重复；管理端订单查询作为 Day 4 结算结果的验证入口补齐 |
| tests run | `pnpm --filter @live-auction/server test`、`pnpm --filter @live-auction/shared build`、`pnpm --filter @live-auction/server typecheck`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm lint` |
| known issues | 用户端出价 API、Redis Lua 原子出价、WebSocket 房间广播、事件 outbox、AuditLog 写入和移动端结果联动仍未实现；结束调度为单机内存 timer，多实例部署需要 Redis delayed queue 或 BullMQ；真实 timer 恢复流程尚未做端到端测试 |
