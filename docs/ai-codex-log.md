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

## 2026-05-24

| 字段 | 内容 |
| --- | --- |
| task | Day 4 后文档审视和整理 |
| prompt summary | 用户要求审视 `docs` 目录，删除不需要内容并补充优化，当前 Day 4 已完成 |
| files changed | `README.md`、`docs/README.md`、`docs/progress.md`、`docs/api.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`，删除 `docs/day1-todo.md` |
| AI-generated parts | 文档索引、进度追踪、Day 4 可演示范围、压测准入条件、手工测试阶段边界、Health 响应契约修正 |
| human-reviewed decisions | 早期 `day1-todo.md` 已过期，改由 `progress.md` 承接进度；所有未实现的出价、Redis、WebSocket 和移动端联动能力继续保留为目标契约，但不得标记为已完成 |
| tests run | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`rg` 文档过期关键词检查、`rg` 明文密钥模式检查 |
| known issues | 本轮不修改业务代码；Day 5 仍需实现出价引擎、并发测试和 Redis/DB 一致性校验 |

## 2026-05-24

| 字段 | 内容 |
| --- | --- |
| task | 基于技术栈学习方案 PDF 生成项目工程经验学习文档 |
| prompt summary | 用户提供 `ChatGPT-技术栈学习方案.pdf`，要求精简形成学习文档，把项目问题整理为可复盘、可迁移、可写简历、可面试讲清楚的工程经验 |
| files changed | `docs/learning/engineering-experience.md`、`docs/README.md`、`docs/ai-codex-log.md` |
| AI-generated parts | PDF 建议提炼、Day4 工程经验卡片、简历素材库、面试题库、后续补充模板 |
| human-reviewed decisions | 不创建十几个分散学习笔记，先用一份主文档承接；只把 Day4 已真实完成的状态机、规则校验、结算、timer、环境和文档治理写成可讲经验；Redis Lua、WebSocket、移动端联动标为后续素材 |
| tests run | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`rg` 未实现能力误标检查、`rg` 明文密钥模式检查 |
| known issues | 本轮不修改业务代码；学习文档里的 Day5/Day6 内容仍需等实现和验证后才能转成简历完成项 |

## 2026-05-24

| 字段 | 内容 |
| --- | --- |
| task | 设置本地学习文档提交规则和每日收尾要求 |
| prompt summary | 用户要求学习文档不要推送到 GitHub，并规定完成每日工作后都要落实该学习文档 |
| files changed | `.gitignore`、`AGENTS.md`、`docs/README.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 本地学习文档忽略规则、每日更新要求、公开文档索引调整、AI 日志记录 |
| human-reviewed decisions | `docs/learning/` 作为本地沉淀目录被 Git 忽略；公开文档索引不再直接链接该目录，避免 GitHub 上出现缺失文件入口；每日完成任务后仍必须更新本地学习文档 |
| tests run | `git check-ignore -v docs/learning/engineering-experience.md`、`git status --short --ignored docs/learning`、`pnpm lint` |
| known issues | 学习文档不会随 GitHub 同步，换机器或重建仓库时需要手动迁移本地 `docs/learning/` 内容 |

## 2026-05-25

| 字段 | 内容 |
| --- | --- |
| task | Day 5 开发：服务端出价引擎、Redis Lua 原子热状态、幂等、延时和封顶成交 |
| prompt summary | 用户要求完成 Day 5 部分任务并更新相应文档 |
| files changed | `apps/server/src/bid/*`、`apps/server/src/cache/redis.service.ts`、`apps/server/src/common/demo-auth.guard.ts`、`apps/server/src/app.module.ts`、`packages/shared/src/error-codes.ts`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/api.md`、`docs/architecture.md`、`docs/consistency.md`、`docs/error-codes.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | `BidModule`、`BidController`、`BidService`、Redis Lua 出价脚本、出价 DTO 校验、bidder demo guard、出价服务单元/并发测试、Day 5 文档和学习沉淀更新 |
| human-reviewed decisions | 出价热路径采用 Redis Lua 原子校验和更新，数据库仍作为权威记录；成功出价先落库 Bid、AuctionSession 和 AuctionEvent outbox，不在 Day 5 直接广播；封顶成交继续通过状态机创建订单；Redis accepted 但 DB 失败时按 MVP 补偿策略返回 `BID_PERSISTENCE_FAILED` 并写审计日志 |
| tests run | `pnpm --filter @live-auction/shared build`、`pnpm --filter @live-auction/server test`、`pnpm --filter @live-auction/server typecheck`、`pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm build`、检查 root `test:e2e` 脚本不存在 |
| known issues | Day 5 尚未实现 WebSocket 网关、outbox 发布 worker、Redis/DB 自动对账、移动端真实联动和真实 HTTP 压测；当前 30/100 并发为服务端单元级一致性测试，不代表生产性能数据 |

## 2026-05-26

| 字段 | 内容 |
| --- | --- |
| task | Day 6 开发：Socket.IO 房间隔离、断线重连 snapshot 和 outbox 广播发布 |
| prompt summary | 用户要求完成 Day 6 任务、更新相应文档，并记录遇到的问题 |
| files changed | `apps/server/package.json`、`apps/server/src/app.module.ts`、`apps/server/src/realtime/*`、`apps/server/src/auction/auction-state-machine.service.ts`、`apps/server/src/auction/auction-state-machine.service.test.ts`、`apps/server/src/admin/admin-auctions.service.ts`、`apps/server/src/bid/*`、`packages/shared/src/*`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/api.md`、`docs/architecture.md`、`docs/consistency.md`、`docs/websocket-events.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | `RealtimeModule`、`AuctionRealtimeGateway`、`AuctionSnapshotService`、`AuctionEventPublisherService`、实时 REST controller、Socket.IO 房间事件处理、outbox 广播映射、状态机 outbox 事件写入、Day 6 测试和文档更新 |
| human-reviewed decisions | 采用 Nest 官方 Socket.IO 适配器而不是自写 WebSocket 协议；成功广播必须来自已落库 `AuctionEvent`；`BID_ACCEPTED` 一个 outbox 事件派生 `BID_ACCEPTED`、`LEADING`、`OUTBID` 和可选 `AUCTION_EXTENDED`；HTTP 出价失败不额外写拒绝事件，Socket.IO 出价失败由 gateway 定向发送 `BID_REJECTED`；移动端页面接入留到 Day 8/Day 9 |
| tests run | `pnpm --filter @live-auction/shared build`、`pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/server test` |
| known issues | 当前 outbox 发布器为单进程轮询，多实例部署可能重复发布，需要后续引入 claim 状态或分布式锁；封顶成交后数据库 `serverSeq` 会推进到结束和订单事件，Redis 热状态暂不反向同步，需要 Redis/DB 对账任务覆盖；尚未做真实 Socket.IO 多浏览器联调、移动端页面接入和正式压测 |

## 2026-05-27

| 字段 | 内容 |
| --- | --- |
| task | Day 7 开发：主播端管理后台页面联调、管理端展示字段补齐和提交推送 |
| prompt summary | 用户要求继续实现 Day 7 任务、更新文档，审查无误后提交至 GitHub |
| files changed | `apps/admin/src/App.tsx`、`apps/admin/src/styles.css`、`apps/server/src/admin/admin-auctions.service.ts`、`apps/server/src/admin/admin-orders.service.ts`、`apps/server/src/auction/auction-state-machine.service.test.ts`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/api.md`、`docs/manual-test.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 管理端竞拍/订单工作台、状态筛选、启动/取消操作、订单列表、后台展示字段 DTO、取消 outbox 单元测试、Day 7 文档和学习沉淀 |
| human-reviewed decisions | 不引入 Ant Design 等大型 UI 依赖，沿用轻量 React/CSS；页面只消费 API 返回状态，不复制竞拍状态机逻辑；订单列表用后端补充的商品和买家字段展示；真实 API 浏览器联调因 Docker Desktop 未运行暂记为待补测 |
| tests run | `pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/admin typecheck`、`pnpm --filter @live-auction/server test`、浏览器打开 `http://localhost:5173/` 检查管理端页面标题、竞拍列表、订单 tab 和控制台错误 |
| known issues | 本机 Docker Desktop 未运行，无法启动 MySQL/Redis 做真实接口浏览器联调；管理端创建商品/竞拍表单仍在 Day 10 范围；移动端真实页面联动和正式压测仍未完成 |

## 2026-05-27

| 字段 | 内容 |
| --- | --- |
| task | Docker 启动后补做 Day 7 真实接口和管理端页面审查 |
| prompt summary | 用户已启动 Docker，要求审查 Day 7 实现 |
| files changed | `apps/server/src/realtime/realtime.controller.ts`、`apps/server/src/realtime/realtime.controller.test.ts`、`docs/manual-test.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 真实 Docker 联调步骤、`RealtimeController` 显式 DI 修复、注入元数据单元测试、手工测试记录 |
| human-reviewed decisions | 保持控制器只代理 snapshot 服务，不移动业务逻辑；修复采用显式 `@Inject(AuctionSnapshotService)`，与项目内其他服务的 Nest DI 写法保持一致；启动/取消真实接口测试后执行 seed 恢复 demo 基线 |
| tests run | `docker ps`、`docker compose ps`、`pnpm --filter @live-auction/server prisma:generate`、`pnpm --filter @live-auction/server exec prisma migrate status --schema prisma/schema.prisma`、`pnpm --filter @live-auction/server prisma:seed`、启动 server/admin、请求 `/health`、`GET /admin/auctions`、`GET /admin/orders`、浏览器打开 `http://localhost:5173/`、`POST /admin/auctions/auction_1/start`、`GET /auctions/auction_1/snapshot`、`POST /admin/auctions/auction_1/cancel`、`pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/server test` |
| known issues | GitHub HTTPS 凭据仍未配置，之前本地提交无法推送；移动端真实 REST/Socket.IO 页面联动和正式压测仍未完成 |

## 2026-05-28

| 字段 | 内容 |
| --- | --- |
| task | Day 8 开发：移动端直播间主页面、竞拍半屏面板和本地 mock 出价交互 |
| prompt summary | 用户要求继续实现 Day 8 相关任务并更新文档 |
| files changed | `apps/mobile/src/App.tsx`、`apps/mobile/src/styles.css`、`apps/mobile/src/mobile-auction-service.ts`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/architecture.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 移动端直播间页面、竞拍小卡片、底部半屏面板、出价步进器、倒计时、toast、本地 mock 出价 service、Day 8 文档和学习沉淀 |
| human-reviewed decisions | Day 8 只做移动端体验骨架和 mock 交互，不接入真实 REST / Socket.IO；mock service 使用 `AuctionSnapshot` 形状，为 Day 9 替换为真实 service 留边界；移动端不复制服务端状态机，本地成交和被超越只作为交互演示 |
| tests run | `pnpm --filter @live-auction/mobile typecheck`、`pnpm --filter @live-auction/mobile build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`、尝试 `pnpm test:e2e` 但根脚本不存在、浏览器打开 `http://localhost:5174/` 检查移动端页面、小卡片、半屏面板、本地出价和控制台错误 |
| known issues | 移动端仍未接入真实 REST / Socket.IO、`serverSeq` 乱序处理和真实错误码展示；外部图片 URL 在离线环境下可能无法显示；仓库尚无 `test:e2e` 脚本；正式压测脚本和 Redis/DB 自动对账仍未完成 |

## 2026-05-29

| 字段 | 内容 |
| --- | --- |
| task | Day 9 开发：移动端接入真实 REST API 和 Socket.IO，并修复真实联调暴露的序列与 seed 重置问题 |
| prompt summary | 用户要求按照相应文档继续实现 Day 9，并在完成后更新相应文档 |
| files changed | `apps/mobile/package.json`、`apps/mobile/src/App.tsx`、`apps/mobile/src/mobile-auction-service.ts`、`apps/mobile/src/styles.css`、`apps/server/src/bid/bid-redis.store.ts`、`apps/server/src/bid/bid.service.test.ts`、`apps/server/prisma/seed.ts`、`pnpm-lock.yaml`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/api.md`、`docs/architecture.md`、`docs/websocket-events.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 移动端真实 REST service、Socket.IO client 接入、snapshot / `serverSeq` 顺序控制、真实 HTTP 出价、错误消息展示、加载失败状态、demo seed 清理、Redis Lua `serverSeq` 初始化修复、Day 9 文档和学习沉淀 |
| human-reviewed decisions | 移动端本轮以 HTTP `POST /auctions/:auctionId/bids` 为主出价路径，Socket.IO 用于房间加入、snapshot 和 outbox 事件；WebSocket 事件只做 UI 提示和轻量补丁，随后以 snapshot 对齐完整状态；前端禁用按钮只做体验保护，幂等仍依赖服务端 `clientBidId`；真实联调发现 Redis Lua 初始 `server_seq=0` 会与启动事件冲突，修复为继承 DB `serverSeq` |
| tests run | `pnpm --filter @live-auction/mobile typecheck`、`pnpm --filter @live-auction/mobile build`、`pnpm --filter @live-auction/server prisma:seed`、真实接口启动 `auction_1` 并提交 HTTP 出价、浏览器打开 `http://localhost:5174/?userId=user_2` 提交真实出价并检查 error/warning 日志为空、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm lint` |
| known issues | 仓库仍无 `test:e2e` 脚本；真实双窗口持续联动、断网重连和乱序/跳号事件仍需后续 E2E 或手工补测；正式 k6/Artillery 压测和 Redis/DB 自动对账任务仍未完成；移动端主出价路径暂为 HTTP，Socket.IO `placeBid` 保留为服务端能力 |

## 2026-05-30

| 字段 | 内容 |
| --- | --- |
| task | Day 10 开发：PC 主播后台商品上架和竞拍规则配置表单 |
| prompt summary | 用户要求实现 Day 10 任务，并更新 docs 相应文档 |
| files changed | `apps/admin/src/App.tsx`、`apps/admin/src/styles.css`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/architecture.md`、`docs/api.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 管理端“商品上架”视图、轻量 SPA path 映射、商品创建表单、竞拍规则配置表单、金额字符串转整数分、卖点解析、串行调用 `POST /admin/items` 和 `POST /admin/auctions`、Day 10 文档和学习沉淀 |
| human-reviewed decisions | 不引入新的 UI 组件库或 React Router，沿用现有轻量 React/CSS；管理端前端只做输入辅助和金额转分，规则合法性和状态流转仍由后端兜底；Day 10 不做 AI 卖点按钮；串行调用两个既有接口会保留“商品已创建但竞拍创建失败”的边界，后续可用后端组合事务接口改进 |
| tests run | `pnpm --filter @live-auction/admin typecheck`、`pnpm --filter @live-auction/admin build`、浏览器打开 `http://localhost:5173/admin/items/new` 检查创建页核心字段和前端 error/warning 日志、`pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm build` |
| known issues | Day 10 创建表单阶段未启动真实 MySQL/Redis/server 做完整页面提交闭环，需 Day 11 补测创建商品、创建竞拍、启动、移动端可见和订单生成；管理端创建商品和竞拍当前为两个接口串行调用，竞拍创建失败可能留下未绑定商品；正式压测和 Redis/DB 自动对账仍未完成 |

## 2026-05-30

| 字段 | 内容 |
| --- | --- |
| task | 根据 Day10 审查 findings 补强竞拍核心闭环 |
| prompt summary | 用户要求根据 findings 完善系统，使其契合 10 天应该完成的任务，并生成成果文档记录完成任务和遇到的问题 |
| files changed | `apps/server/src/bid/bid-redis.store.ts`、`apps/server/src/bid/bid.service.ts`、`apps/server/src/bid/bid.service.test.ts`、`apps/server/src/realtime/auction-event-publisher.service.ts`、`apps/server/src/realtime/auction-event-publisher.service.test.ts`、`apps/server/src/day10-core-loop.e2e.test.ts`、`apps/server/package.json`、`package.json`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/architecture.md`、`docs/consistency.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/day10-result.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | Redis accepted 后 DB 失败安全回滚、`AuctionSession.updateMany` 命中检查、outbox `FAILED` 重试、Day10 服务级核心闭环 e2e、`test:e2e` 脚本、Day10 成果文档和文档同步 |
| human-reviewed decisions | Redis 回滚只在 accepted 出价仍是最新 `serverSeq` 时执行，避免覆盖后续已接受出价；outbox 先复用现有 `FAILED` 状态做重试，不新增迁移字段；Day10 自动化闭环采用服务级 fake 环境，真实 MySQL/Redis/浏览器联调留给 Day11 |
| tests run | `pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/server test`、`pnpm test:e2e`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm lint` |
| known issues | Day10 e2e 仍不是完整真实环境浏览器测试；outbox retry 还没有 retry 次数、退避和死信队列；Redis/DB 周期自动对账 worker 未实现；管理端创建商品和竞拍仍是两个接口串行调用 |

## 2026-05-31

| 字段 | 内容 |
| --- | --- |
| task | Day 11 开发：端到端联调与异常场景服务级 e2e 补齐 |
| prompt summary | 用户要求实现 Day 11 任务，并更新相应文档 |
| files changed | `apps/server/src/day11-auction-scenarios.e2e.test.ts`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | Day 11 服务级 e2e fake Prisma / fake Redis harness、异常场景测试、进度和验收文档同步、本地学习沉淀 |
| human-reviewed decisions | 本轮不引入新测试框架，不把服务级 e2e 包装成真实浏览器或真实压测；继续复用现有 service 层边界验证业务闭环，真实 Docker 多窗口联动留作手工记录和 Day 12 压测前置 |
| tests run | `pnpm --filter @live-auction/server test:e2e`、`pnpm --filter @live-auction/server typecheck`、`pnpm test:e2e`、`pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm build` |
| known issues | Day 11 新增 e2e 仍使用 fake Prisma / fake Redis store，不覆盖真实网络、真实 MySQL/Redis 连接、真实浏览器 UI 和 Socket.IO 断网重连；正式压测脚本、Redis/DB 周期对账、outbox 退避/死信仍未实现 |

## 2026-05-31

| 字段 | 内容 |
| --- | --- |
| task | Day 12 开发：真实 HTTP 并发压测、压测暴露问题修复和文档同步 |
| prompt summary | 用户要求先压缩必要信息，再继续完成 Day 12 并更新文档 |
| files changed | `apps/server/src/performance/day12-http-load.ts`、`apps/server/src/performance/day12-bid-load.k6.js`、`apps/server/src/bid/bid-redis.store.ts`、`apps/server/src/bid/bid.service.ts`、`apps/server/src/bid/bid.service.test.ts`、`apps/server/package.json`、`package.json`、`README.md`、`docs/README.md`、`docs/progress.md`、`docs/architecture.md`、`docs/consistency.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | Day 12 HTTP 压测脚本、k6 HTTP 模板、真实压测数据记录、Redis Lua payload 解析兼容、同一竞拍单进程出价处理队列、对应单元测试和文档同步 |
| human-reviewed decisions | 本轮优先补真实 HTTP + MySQL + Redis 压测，不把 k6 模板或 1000 Socket.IO 连接写成已完成；同一竞拍的幂等检查、Redis Lua 和 DB 持久化先用单进程 `auctionId` 级队列兜住 MVP，一旦多实例部署必须切到 Redis Stream、消息队列、DB claim 或分布式锁 |
| tests run | `docker compose up -d mysql redis`、`pnpm --filter @live-auction/server prisma:generate`、`pnpm --filter @live-auction/server exec prisma migrate status --schema prisma/schema.prisma`、`pnpm --filter @live-auction/server prisma:seed`、`pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/server build`、`pnpm --filter @live-auction/server test`、`pnpm perf:day12`、`$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS`、`pnpm test:e2e`、`pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm build` |
| known issues | 本轮压测运行在本机 dev server，不代表生产构建或云环境性能；1000 Socket.IO 连接压测、真实浏览器多窗口断网联动、Redis/DB 周期自动对账、outbox 退避/死信队列仍未完成；单进程出价处理队列不适用于多实例部署 |

## 2026-05-31

| 字段 | 内容 |
| --- | --- |
| task | Day 13 审查补强：暂缓 AI 加成，修复演示主链路问题并整理 Day14 清单 |
| prompt summary | 用户要求全面审查代码、查找 bug，暂缓 Day13 AI 加成，列出距离 Day14 完整演示还差什么，并尽全力解决 |
| files changed | `apps/server/src/bid/bid.service.ts`、`apps/server/src/bid/bid.service.test.ts`、`apps/server/src/realtime/auction-event-publisher.service.ts`、`apps/server/src/realtime/auction-snapshot.service.ts`、`apps/server/src/realtime/auction-snapshot.service.test.ts`、`apps/server/src/order/*`、`apps/server/src/app.module.ts`、`apps/mobile/src/App.tsx`、`apps/mobile/src/mobile-auction-service.ts`、`apps/mobile/src/styles.css`、`README.md`、`docs/README.md`、`docs/api.md`、`docs/progress.md`、`docs/architecture.md`、`docs/consistency.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/day14-demo-checklist.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 出价处理队列粒度补强、outbox 发布防重入、用户订单 / 竞拍历史 / mock-pay 接口、竞拍历史订单号恢复、移动端结果弹窗和模拟支付入口、`auctionId` 定向进入、房间竞拍列表按最近更新排序、Day14 演示清单 |
| human-reviewed decisions | AI 卖点功能暂缓，优先保证商品上架到成交订单和模拟支付的可演示闭环；单进程队列是 MVP 演示兜底，多实例仍必须替换为跨进程队列或 claim；1000 Socket.IO 压测不写成已完成 |
| tests run | `pnpm --filter @live-auction/server test`、`pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/mobile typecheck`、`pnpm --filter @live-auction/mobile build`、`pnpm perf:day12`、`$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS`、真实 HTTP 封顶成交后查询用户历史 / 订单详情 / mock-pay、浏览器打开 `http://localhost:5174/?userId=user_1&auctionId=...` 验证结果弹窗和支付、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm build` |
| known issues | 真实浏览器双窗口交替出价和断网重连仍需最终手测记录；Redis/DB 周期自动对账、outbox 退避/死信和 1000 Socket.IO 压测仍未完成；per-auction 单进程队列提升一致性但增加同场高并发延迟 |

## 2026-06-01

| 字段 | 内容 |
| --- | --- |
| task | 根据本周完成情况整理周报 |
| prompt summary | 用户要求根据本周完成情况写一份周报，包括本周主要进展、遇到的问题、具体设计等 |
| files changed | `docs/weekly-report-2026-06-01.md`、`docs/README.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 周报结构、本周进展归纳、出价链路 / 实时事件 / 状态机 / 前端状态设计说明、问题处理表、风险和下周计划 |
| human-reviewed decisions | 周报统计口径明确为 `2026-05-26` 至 `2026-06-01`；只记录已在进度、日志和性能报告中出现的事实，不把 1000 Socket.IO 压测、Redis/DB 自动对账、AI 卖点等未完成能力写成已完成 |
| tests run | 文档任务，未运行代码测试；执行文档读取、Git 记录和内容一致性检查 |
| known issues | 周报基于当前仓库文档和工作区改动整理；真实浏览器双窗口最终手测、1000 Socket.IO 压测、Redis/DB 周期对账仍需后续补齐 |

## 2026-06-01

| 字段 | 内容 |
| --- | --- |
| task | 最终推送前审视：检查项目与 diff，修复审视发现问题，形成最终可部署差距评估和计划文档 |
| prompt summary | 用户要求完整审视项目以及 diff，无误后推送至 GitHub，并评估距离最终完整可部署项目还有多远，形成最终计划文档 |
| files changed | `apps/server/src/bid/bid-redis.store.ts`、`apps/server/src/performance/day12-bid-load.k6.js`、`docs/final-deployment-plan.md`、`docs/README.md`、`docs/performance-report.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | Redis 回滚计数审视修复、k6 阈值配置化、最终可部署差距评估、P0 阻断项和分阶段计划 |
| human-reviewed decisions | 不把当前单进程队列、demo 身份、未执行的 1000 Socket.IO 压测描述为生产化完成；按演示可用和生产化可部署两个口径分别评估距离 |
| tests run | `pnpm --filter @live-auction/server test`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm build`、`git diff --check`、secrets 关键词扫描、确认 `docs/learning/` 未进入 Git 状态 |
| known issues | 多实例出价顺序、Redis/DB 自动对账、outbox claim/死信、1000 Socket.IO 压测、真实认证和生产部署流水线仍是最终可部署前的主要缺口 |

## 2026-06-01

| 字段 | 内容 |
| --- | --- |
| task | 根据最终部署计划完成最后项目任务 |
| prompt summary | 用户要求按 `docs/final-deployment-plan.md` 完成最后的项目任务 |
| files changed | `packages/shared/src/error-codes.ts`、`apps/server/src/cache/redis.service.ts`、`apps/server/src/bid/*`、`apps/server/src/realtime/*`、`apps/server/src/auction/*`、`apps/server/src/admin/*`、`apps/server/prisma/schema.prisma`、新增 Prisma migration、`apps/server/src/performance/day12-socket-load.ts`、`apps/admin/src/App.tsx`、三端 Dockerfile、`docker-compose.prod.yml`、`.github/workflows/ci.yml`、`README.md`、`docs/*`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | Redis 分布式出价锁、锁超时错误码、outbox claim/lease/死信、Redis/DB 对账审计 worker、事务式商品+竞拍创建接口、Socket.IO 连接压测脚本、生产 compose/Docker/CI、相关测试和文档同步 |
| human-reviewed decisions | 对账 worker 只检测和写审计，不自动修复价格、赢家、订单；出价锁先用 Redis lock 覆盖多实例关键段，后续高吞吐再评估 Stream/BullMQ/DB claim；生产 compose 可用于本地演示，真实生产迁移和 seed 应拆成独立 SOP；Socket.IO 脚本新增但不把未执行的 100/1000 结果写成完成 |
| tests run | `pnpm install --lockfile-only`、`pnpm install`、`pnpm --filter @live-auction/server prisma:generate`、`pnpm --filter @live-auction/shared build`、`pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/server test`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm build`、`docker compose -f docker-compose.prod.yml config`、`git diff --check`、secrets 关键词扫描、确认 `docs/learning/` 仍为 ignored |
| known issues | 生产 compose 尚未实际 build/up，Socket.IO 100/1000 真实压测和浏览器双窗口/断网重连最终手测仍需后续记录；真实认证、限流、Playwright 全链路和自动修复型对账仍未实现 |

## 2026-06-03

| 字段 | 内容 |
| --- | --- |
| task | 整理 `docs/` 文档，删减过时和重复材料，并按最终演示验收流程补齐提交文档 |
| prompt summary | 用户要求全面审视代码库和 `docs/demo-script.md` 第五项，删除或删减过时重复文档，补齐最终演示验收材料 |
| files changed | `README.md`、`docs/README.md`、`docs/final-acceptance.md`、`docs/demo-script.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/final-deployment-plan.md`、`docs/api.md`、`docs/architecture.md`、`docs/websocket-events.md`、`docs/ai-codex-log.md`、删除 `docs/progress.md`、`docs/development-process.md`、`docs/day10-result.md`、`docs/day14-demo-checklist.md`、`docs/weekly-report-2026-06-01.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 文档索引重组、最终验收 14 项材料、5 分钟演示脚本、手工测试清单、性能报告口径、最终部署差距评估、README 快速启动说明和过期契约修正 |
| human-reviewed decisions | 保留契约文档和真实证据入口，删除 Day 过程性重复文档；不把公网 Demo、演示视频、Socket.IO 100/1000 结果、Playwright、生产 compose 实跑、AI 卖点功能写成已完成；历史 AI 日志中的旧文件名作为历史记录保留 |
| tests run | `pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm build`、`git diff --check`、`git check-ignore -v docs\\learning\\engineering-experience.md`、文档过期引用扫描 |
| known issues | 真实浏览器双窗口交替出价、断线重连、Socket.IO 100/1000 连接压测、生产 compose 新环境实跑、真实认证 / 限流、Playwright 全链路和自动修复型对账仍待后续补齐 |

## 2026-06-03

| 字段 | 内容 |
| --- | --- |
| task | 修复最终手测暴露的问题，并更新手工测试文档 |
| prompt summary | 用户已按 `docs/manual-test.md` 完成基本手测，要求修复记录的问题：流拍刷新回退、第三个用户无法竞拍、本地图片无法直接选择，并同步更新文档 |
| files changed | `apps/mobile/src/mobile-auction-service.ts`、`apps/server/src/bid/bid.service.ts`、`apps/server/src/bid/bid.service.test.ts`、`apps/server/prisma/seed.ts`、`apps/server/src/admin/admin-uploads.controller.ts`、`apps/server/src/admin/admin-uploads.service.ts`、`apps/server/src/admin/admin.module.ts`、`apps/server/src/common/upload-paths.ts`、`apps/server/src/main.ts`、`apps/admin/src/App.tsx`、`apps/admin/src/styles.css`、`README.md`、`docs/api.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/final-acceptance.md`、`docs/final-deployment-plan.md`、`docs/README.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | 移动端默认场次选择修复、demo bidder 自动创建、`user_3` seed、管理端本地图片上传接口和表单入口、手测问题修复记录、性能证据口径同步 |
| human-reviewed decisions | 流拍刷新问题只调整客户端默认选择优先级，不改变后端列表排序；第三用户问题在 Redis 原子出价前校验 / 创建 demo bidder，避免先 accepted 再 DB 外键失败；demo bidder 创建补唯一约束竞态兜底；本地图片上传限定为 demo 静态目录，并校验 base64 与图片文件头，生产仍应使用对象存储或 CDN |
| tests run | `pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/admin typecheck`、`pnpm --filter @live-auction/mobile typecheck`、`git diff --check`、`pnpm --filter @live-auction/server test`、`pnpm typecheck`、`pnpm test:e2e`、`pnpm test`、`pnpm lint`、`pnpm build` |
| known issues | 三个手测修复仍需重启后端 / 前端后按 `docs/manual-test.md` 复测；本地图片上传是演示能力，不适合直接作为公网生产文件存储 |

## 2026-06-04

| 字段 | 内容 |
| --- | --- |
| task | 审查当前 diff，修复审查发现的边界问题，并准备推送 GitHub |
| prompt summary | 用户要求审查 diff，确认无 bug 后推送至 GitHub |
| files changed | `apps/server/src/bid/bid.service.ts`、`apps/server/src/bid/bid.service.test.ts`、`apps/server/src/admin/admin-uploads.service.ts`、`apps/server/src/admin/admin-uploads.service.test.ts`、`docs/api.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | demo bidder 唯一约束竞态兜底、上传 base64 严格校验、图片文件头匹配校验、上传服务测试和 diff 审查日志 |
| human-reviewed decisions | 不回退用户已有文档清理和演示功能变更；只补审查发现的真实边界风险；上传仍定位为本地演示能力，生产需对象存储 / CDN / 内容安全策略 |
| tests run | `git diff --check`、`pnpm --filter @live-auction/server typecheck`、`pnpm --filter @live-auction/admin typecheck`、`pnpm --filter @live-auction/mobile typecheck`、`pnpm --filter @live-auction/server test`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm build` |
| known issues | 真实浏览器三用户交替出价、流拍刷新和本地图片上传仍需重启服务后按手工清单复测；本地上传未实现鉴权外的配额、病毒扫描、对象存储或 CDN |

## 2026-06-04

| 字段 | 内容 |
| --- | --- |
| task | 修复生产 compose 本机实跑失败 |
| prompt summary | 用户说明 DEV 手册已完成、无 bug，但生产 compose 拉不起来，要求继续处理 P0 收口问题 |
| files changed | `.dockerignore`、`.env.example`、`docker-compose.prod.yml`、`packages/shared/src/index.ts`、`README.md`、`docs/manual-test.md`、`docs/ai-codex-log.md`、本地忽略文件 `docs/learning/engineering-experience.md` |
| AI-generated parts | Docker build context 忽略规则修复、生产 compose MySQL/Redis 宿主机端口避让、shared 包 Node ESM 导出修复、生产 compose 实跑记录 |
| human-reviewed decisions | 不要求用户停止 dev compose，改为让生产 compose 默认使用 `13307/16379` 暴露 MySQL/Redis；server 内部仍使用 Docker 网络里的 `mysql:3306` 和 `redis:6379`；shared 包采用显式 `.js` re-export，兼容 Node ESM 生产运行 |
| tests run | `docker compose -f docker-compose.prod.yml config`、`docker compose -f docker-compose.prod.yml up -d --build`、`docker compose -f docker-compose.prod.yml ps`、`curl.exe -sS --max-time 10 http://127.0.0.1:3000/health`、`curl.exe -sS --max-time 10 -I http://127.0.0.1:8080/`、`curl.exe -sS --max-time 10 -I http://127.0.0.1:8081/`、`curl.exe -sS --max-time 10 http://127.0.0.1:3000/admin/auctions -H "X-Demo-User-Id: admin_1" -H "X-Demo-Role: admin"`、`pnpm --filter @live-auction/shared typecheck`、`pnpm --filter @live-auction/shared build`、`git diff --check`、`pnpm typecheck`、`pnpm test:e2e`、`pnpm lint`、`pnpm test` 单独重跑通过、`pnpm build` |
| known issues | 本次验证是本机生产 compose 实跑，不等同于全新机器或公网生产部署；生产 compose 仍使用 demo seed、默认凭据和本地静态上传目录，真实部署前必须替换；一次并行运行 `pnpm test` / `typecheck` / `test:e2e` / `lint` 时本机资源不足导致 `pnpm test` OOM，单独重跑已通过 |
