# Day 14 完整演示清单

本文档用于 Day 14 前的最终演示审查。AI 卖点 / 直播话术功能已按当前决策暂缓，不作为 Day 14 主链路阻塞项。

## 1. 已修复的审查问题

| 优先级 | 问题 | 风险 | 处理结果 |
| --- | --- | --- | --- |
| P0 | 同一竞拍仅串行 DB 持久化，Redis accepted 仍可能先并发推进 | 如果某个 accepted bid DB 写失败且后面已有更高 `serverSeq`，Redis 回滚会失败，DB 可能出现 bidCount / Bid / outbox 缺口 | 已把同一竞拍的幂等检查、最新 DB 快照读取、Redis Lua 和 DB 持久化整体放入当前单进程 `auctionId` 级队列 |
| P1 | outbox 定时轮询没有单进程防重入 | 慢发布时同一进程可能重叠扫描同一批 `PENDING/FAILED` 事件，造成重复广播 | 已为定时发布循环增加 `isPublishing` 防重入 |
| P1 | API 文档列出用户订单、竞拍历史和模拟支付，但代码未实现 | Day14 演示成交后如果打开用户订单或模拟支付会 404 | 已新增用户订单接口：`GET /users/me/auction-history`、`GET /orders/:orderId`、`POST /orders/:orderId/mock-pay` |
| P1 | 移动端收到成交订单后只有 toast，没有结果视图和支付入口 | 演示成交闭环时用户端缺少“成交 -> 支付”的可视化收尾 | 已新增移动端结果弹窗，中拍用户收到 `ORDER_CREATED` 后可模拟支付 |
| P2 | 用户竞拍历史缺少订单号 | 刷新或错过 `ORDER_CREATED` 后，中拍用户无法从历史恢复支付入口 | 已让 `GET /users/me/auction-history` 返回 `orderId` / `orderStatus`，移动端结束场次可恢复中拍订单 |
| P2 | 压测历史竞拍会影响移动端默认选择 | 直播间存在多个已结束竞拍时，刷新可能跳到旧压测商品 | 房间竞拍列表改按 `updatedAt` 排序，移动端支持 `?auctionId=...` 定向进入 |

## 2. Day 14 演示主链路

1. 启动 MySQL、Redis、server、admin、mobile。
2. 后台进入 `/admin/items/new` 创建商品并配置竞拍规则。
3. 后台回到竞拍列表，启动刚创建的 `SCHEDULED` 竞拍。
4. 两个移动端窗口分别使用不同 `userId` 进入同一直播间。
5. 用户 A 出价，用户 B 看到当前价变化。
6. 用户 B 加价，用户 A 收到“你已被超越”。
7. 在最后 10 秒内出价，展示倒计时延时。
8. 出价达到封顶价或等待到期，竞拍进入成交或流拍。
9. 成交用户收到结果弹窗和订单号，点击“模拟支付”。
10. 后台订单列表展示该订单，状态可看到 `PAID` 或至少看到已生成订单。

## 3. 演示前必须完成的真实验证

| 检查项 | 命令或操作 | 通过标准 | 当前状态 |
| --- | --- | --- | --- |
| Docker 依赖 | `docker compose up -d mysql redis` | MySQL、Redis 容器 healthy | 待最终执行 |
| 数据库迁移 | `pnpm --filter @live-auction/server exec prisma migrate status --schema prisma/schema.prisma` | schema up to date | 待最终执行 |
| Seed | `pnpm --filter @live-auction/server prisma:seed` | demo 用户、房间、竞拍重置成功 | 待最终执行 |
| 后端健康检查 | `GET /health` | `status=ok`，DB/Redis 均 ok | 待最终执行 |
| 后台页面 | 打开 `http://localhost:5173/admin/items/new` | 表单可见，无控制台 error | 待最终手测 |
| 移动端用户 A | 打开 `http://localhost:5174/?userId=user_1&auctionId=...` | 可加载直播间、竞拍卡片和半屏面板 | 单窗口结果态浏览器烟测通过；出价态待最终手测 |
| 移动端用户 B | 打开 `http://localhost:5174/?userId=user_2&auctionId=...` | 可独立出价并收到实时事件 | 待最终手测 |
| 多窗口实时出价 | A/B 交替出价 | 当前价单调递增，领先/被超越提示正确 | 待最终手测 |
| 断线重连 | 关闭或刷新移动端窗口 | 重连后 snapshot 恢复当前价、排名和倒计时 | 待最终手测 |
| 结果弹窗 | 成交或流拍后观察移动端 | 结果弹窗出现，中拍用户可模拟支付 | 已做单窗口浏览器烟测：`auctionId` 定向进入后可恢复订单并完成 mock-pay；双窗口仍待最终手测 |
| 后台订单 | 打开 `/admin/orders` | 订单可见，金额和买家正确 | 服务级 e2e 和真实 HTTP 已覆盖；真实后台页面最终手测待补 |
| 30/100 HTTP 压测 | `pnpm perf:day12` 和 `DAY12_BID_ATTEMPTS=100` | 一致性校验通过 | 已重跑：30 accepted 23/30，100 accepted 80/100，Redis/DB/snapshot/订单一致 |

## 4. 自动化校验门禁

收尾前必须通过：

```bash
pnpm test:e2e
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

服务端核心改动还需单独确认：

```bash
pnpm --filter @live-auction/server test
pnpm --filter @live-auction/server typecheck
```

## 5. 仍未完成但不阻塞 Day 14 主演示

| 项目 | 原因 | 演示时说法 |
| --- | --- | --- |
| AI 卖点 / 直播话术 | 用户已要求暂缓 Day13 AI 加成 | 明确说 AI 是加分项，当前主链路不依赖 AI |
| 1000 Socket.IO 连接压测 | 当前已有真实 HTTP 30/100 压测，Socket.IO 千连接需要单独脚本和环境 | 不能宣称完成 1000 WebSocket 压测 |
| Redis/DB 周期自动对账 worker | 当前有失败当场回滚和审计，但没有后台周期修复 | 说明已有补偿入口，生产化还需对账 worker |
| 多实例部署一致性 | 当前 per-auction 队列是单进程内存方案 | 说明多实例需要 Redis Stream、消息队列、DB claim 或分布式锁 |
| outbox 退避、重试次数和死信队列 | 当前会重试 `FAILED`，但没有退避和死信 | 说明 MVP 可恢复临时失败，生产需要补重试策略 |
| 真实支付 | 不在 MVP 范围 | 演示使用 `mock-pay`，不接第三方支付 |

## 6. 演示风险和应对

- 如果外部图片加载失败，不影响竞拍主流程；可以使用 seed 或现场创建时填稳定图片 URL。
- 如果后台创建商品成功但竞拍创建失败，可能留下未绑定商品；演示前先用默认规则或 seed 基线降低失败概率。
- 如果移动端事件偶发延迟，以 snapshot 刷新为准；页面已经在跳号和重连时重新拉 snapshot。
- 如果压测后留下临时竞拍数据，可重新执行 `pnpm --filter @live-auction/server prisma:seed` 恢复固定演示基线。
- 如果同一场竞拍短时间压入 100 个 HTTP 出价，本机 dev server p95 约 3.52s；当前是用单进程 per-auction 队列换一致性，演示中不要把它宣称为生产性能上限。
