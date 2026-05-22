# Prisma

Day 2 已补充 Prisma schema 和 seed。

建模表：

- users
- live_rooms
- auction_items
- auction_rules
- auction_sessions
- bids
- orders
- auction_events
- audit_logs

常用命令：

```bash
pnpm --filter @live-auction/server prisma:generate
pnpm --filter @live-auction/server prisma:migrate -- --name init
pnpm --filter @live-auction/server prisma:seed
```

说明：

- 当前使用 Prisma 7，连接串位于 `apps/server/prisma.config.ts`。
- 运行时 `PrismaClient` 通过 `@prisma/adapter-mariadb` 连接 MySQL。
- `.env.example` 中的数据库密码只是本地 demo 占位，不得替换为真实生产密钥后提交。
