# Day 1 TODO 清单

## 已完成

- [x] 整理需求分析。
- [x] 整理技术栈约束。
- [x] 整理 15 天开发流程。
- [x] 中文化 `AGENTS.md`。
- [x] 创建 pnpm workspace。
- [x] 创建 `apps/server` NestJS 骨架。
- [x] 创建 `apps/admin` Vite React 骨架。
- [x] 创建 `apps/mobile` Vite React 骨架。
- [x] 创建 `packages/shared` 共享契约包。
- [x] 编写 `docs/architecture.md` 初稿。
- [x] 编写 `docs/api.md` 初稿。
- [x] 编写 `docs/websocket-events.md` 初稿。

## Day 2 待办

- [ ] 补充 `docker-compose.yml`，包含 MySQL 和 Redis。
- [ ] 引入 Prisma。
- [ ] 编写 Prisma schema。
- [ ] 建模 `users`、`live_rooms`、`auction_items`、`auction_rules`、`auction_sessions`、`bids`、`orders`、`auction_events`、`audit_logs`。
- [ ] 添加数据库唯一约束：`auctionId + clientBidId`、`orders.auctionId`。
- [ ] 添加 Redis 连接配置。
- [ ] 补充 seed 脚本。
- [ ] 扩展 `/health`，检查数据库和 Redis 连接。

## 开发原则提醒

- 不提交真实密钥。
- 所有金额使用整数分。
- 状态机逻辑必须集中。
- 出价幂等和订单唯一性必须由 Redis 原子操作和数据库约束共同兜底。
- WebSocket 事件必须房间隔离，客户端重连必须拉 snapshot。
