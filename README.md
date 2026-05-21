# 直播竞拍全栈系统

面向抖音直播电商场景的全栈竞拍系统，目标是完成：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单
```

当前处于 Day 1：工程骨架和文档基线阶段。

## 技术栈

- Monorepo：pnpm workspace
- 移动端 H5：React + TypeScript + Vite
- PC 管理后台：React + TypeScript + Vite
- 后端：Node.js + TypeScript + NestJS
- 共享契约：`packages/shared`
- 数据库：MySQL，后续使用 Prisma
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
```

## 本地启动

安装依赖：

```bash
pnpm install
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
```

## 环境变量

复制 `.env.example` 到 `.env` 后填写本地配置。真实密钥只允许放在 `.env`，不得提交。

## Day 1 完成内容

- 创建 pnpm monorepo。
- 创建 `apps/server` NestJS 骨架和 `/health` 健康检查。
- 创建 `apps/admin` 和 `apps/mobile` Vite React 骨架。
- 创建 `packages/shared`，沉淀竞拍状态、WebSocket 事件和错误码。
- 补齐架构、API、WebSocket 事件和 Day 1 TODO 文档。

## 当前限制

- 尚未实现数据库模型、Docker Compose、竞拍业务接口和 WebSocket 网关。
- 当前页面是骨架占位，用于验证工程结构。
- 出价、状态机、订单结算和并发一致性将在 Day 2 之后逐步实现。
