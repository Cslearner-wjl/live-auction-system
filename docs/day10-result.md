# Day 10 竞拍核心闭环成果文档

日期：2026-05-30

## 1. 本轮目标

根据 Day 10 审查 findings，补齐竞拍核心闭环的工程证据和关键一致性短板，使系统更符合 `docs/development-process.md` 中 Day 1-Day 10 的阶段目标：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单
```

## 2. 已完成任务

### 2.1 管理端 Day 10 闭环页面

- 新增“商品上架”视图。
- 支持 `/admin/items`、`/admin/items/new`、`/admin/auctions`、`/admin/orders` 轻量 SPA path 映射。
- 商品表单覆盖商品名称、图片 URL、商品介绍和卖点标签。
- 竞拍规则表单覆盖直播间 ID、0 元起拍、固定加价、竞拍时长、封顶价、防狙击窗口、延时时长和最大延时次数。
- 表单提交后先调用 `POST /admin/items` 创建商品，再调用 `POST /admin/auctions` 创建 `SCHEDULED` 竞拍。
- 金额输入按元填写，提交前转换为整数分。

### 2.2 出价一致性补强

- `BidService.persistAcceptedBid` 现在会检查 `AuctionSession.updateMany` 是否真实更新 1 条记录。
- 如果 Redis Lua 已接受出价但 DB 持久化失败，会调用 Redis 安全回滚。
- Redis 回滚只在该出价仍是最新 `serverSeq` 时执行，避免覆盖后续已接受出价。
- 回滚会恢复当前价、最高出价人、结束时间、延时次数、出价次数、用户排行榜和 `clientBidId` 热幂等键。
- 审计日志会记录 `redisRollbackSucceeded`，便于后续对账。

### 2.3 outbox 重试补强

- `AuctionEventPublisherService.publishPendingOnce` 现在会拉取 `PENDING` 和 `FAILED` 事件。
- 临时发布失败的 outbox 事件后续可重试，成功后转为 `PUBLISHED`。
- 保留失败审计日志，用于排查无法发布的坏 payload 或网关异常。

### 2.4 自动化闭环证据

- 新增 `apps/server/src/day10-core-loop.e2e.test.ts`。
- 新增脚本：
  - 根目录：`pnpm test:e2e`
  - 服务端：`pnpm --filter @live-auction/server test:e2e`
- 自动化覆盖：
  - 创建商品。
  - 创建 0 元起拍竞拍。
  - 启动竞拍。
  - 用户端房间竞拍列表可见。
  - 用户出价达到封顶价。
  - 状态机成交并生成订单。
  - 后台订单列表能看到成交订单。
  - outbox 写入 `AUCTION_STARTED`、`BID_ACCEPTED`、`AUCTION_ENDED`、`ORDER_CREATED`。

## 3. 遇到的问题与处理

| 问题 | 风险 | 处理 |
| --- | --- | --- |
| Day10 缺少端到端自动化证据 | 只能证明模块可用，不能证明闭环可跑 | 新增 Day10 核心闭环 e2e 测试和 `test:e2e` 脚本 |
| Redis accepted 后 DB 写失败 | Redis 当前价和 DB 状态可能不一致，客户端重试可能被热幂等键拒绝 | 增加 Redis 安全回滚和审计字段 |
| DB 快照更新未命中没有显式失败 | 可能写入 Bid / outbox 但 `AuctionSession` 没更新 | 检查 `updateMany.count`，未命中时进入补偿路径 |
| outbox `FAILED` 后不再发布 | 临时网关故障可能导致事件永久漏发 | 发布器重新扫描 `FAILED` 事件，成功后标记 `PUBLISHED` |
| 管理端创建商品和竞拍非单事务 | 竞拍创建失败时可能留下未绑定商品 | 页面提示该边界；后续建议补后端组合事务接口 |

## 4. 当前验证结果

本轮已执行：

```bash
pnpm --filter @live-auction/server typecheck
pnpm --filter @live-auction/server test
pnpm test:e2e
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

阶段性结果：

- 服务端类型检查通过。
- 全仓类型检查通过。
- 服务端测试从 32 个扩展到 36 个，全仓 `pnpm test` 通过。
- `pnpm test:e2e` 通过 1 个 Day10 核心闭环测试。
- 全仓 build 通过。
- 全仓 lint 脚本通过。

## 5. 已知边界

- Day10 e2e 是服务级闭环测试，使用 fake Prisma / fake Redis store，不等同于真实 MySQL + Redis + 浏览器全链路测试。
- 管理端创建商品和竞拍仍是两个 REST 调用串行编排，不是后端单事务。
- outbox retry 当前没有 retry 次数和退避字段；临时失败可恢复，坏 payload 会重复失败并留下审计。
- Redis/DB 自动周期对账 worker 尚未实现。
- 正式 k6 / Artillery 压测仍在 Day 12 范围。

## 6. 后续建议

- Day11 用真实 Docker MySQL / Redis 跑一次浏览器闭环：管理端创建竞拍、启动、移动端出价、成交、后台订单可见。
- 为 outbox 增加 `retryCount`、`lastError`、`nextRetryAt` 或引入 claim 状态。
- 增加 Redis/DB 对账 worker，扫描 `RUNNING` 和最近结束竞拍，修复热状态与 DB 快照差异。
- 提供后端组合接口，一次事务内创建商品、规则和竞拍，替代管理端串行双请求。
