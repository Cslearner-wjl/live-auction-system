# 最终可部署差距评估与计划

日期：2026-06-03

本文基于当前代码库审视结果整理，区分“本地演示可用”和“生产化可部署”。不要把本地 demo 能力等同于生产能力。

## 1. 当前结论

当前项目已经具备本地演示闭环：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单 -> 模拟支付
```

本地演示完成度约为 **88%**：核心流程、服务级测试、真实 HTTP 30/100 并发压测、Socket.IO 100/1000 连接压测、生产 compose 配置和最终验收文档已具备；剩余主要是浏览器最终复测、Playwright 全链路和生产 compose 实跑记录。

生产化可部署完成度约为 **75%**：Redis 分布式锁、outbox claim/lease/死信、对账审计和 CI 已补齐，但真实认证、限流、Playwright 全链路、监控告警、自动修复 SOP 和新环境部署验证仍缺。

## 2. 已落地的生产化补强

| 方向 | 当前实现 | 证据 |
| --- | --- | --- |
| 出价并发 | 本进程 `auctionId` 队列 + Redis 分布式锁 + Redis Lua | `apps/server/src/bid/bid.service.ts`、`apps/server/src/bid/bid-redis.store.ts` |
| 幂等和唯一性 | `Bid(auctionId, clientBidId)`、`Order(auctionId)` 唯一约束 | `apps/server/prisma/schema.prisma` |
| 状态机 | 启动、取消、成交、流拍统一通过状态机服务 | `apps/server/src/auction/auction-state-machine.service.ts` |
| outbox | `PROCESSING`、claim/lease、尝试次数、`DEAD_LETTER` | `apps/server/src/realtime/auction-event-publisher.service.ts` |
| 对账 | 周期比对 Redis 与 DB，差异写审计 | `apps/server/src/auction/auction-consistency.service.ts` |
| 前端闭环 | 管理端事务式创建，移动端 REST + Socket.IO + 结果弹窗 | `apps/admin/src/App.tsx`、`apps/mobile/src/App.tsx` |
| 部署 | 三端 Dockerfile、`docker-compose.prod.yml`、CI | `apps/*/Dockerfile`、`.github/workflows/ci.yml` |
| 性能证据 | HTTP 30/100 并发真实数据、Socket.IO 100/1000 连接真实数据 | `docs/performance-report.md` |

## 3. 仍未完成的关键缺口

| 模块 | 缺口 | 风险 |
| --- | --- | --- |
| 浏览器端到端 | 缺 Playwright 覆盖后台创建、双用户出价、成交、支付 | UI 回归只能靠手测发现 |
| Socket.IO 出价链路压测 | 已有连接压测，缺 WebSocket 直接出价压测 | 无法证明 WebSocket 出价路径在大连接下的尾延迟 |
| 部署验证 | 有生产 compose，缺新机器或干净环境实跑记录 | 迁移、seed、健康检查顺序仍可能有环境问题 |
| 认证和限流 | 当前是 demo header / query 身份 | 不能用于公网生产环境 |
| 对账修复 | 当前只检测和审计，不自动修复 | 真实故障后需要人工 repair SOP |
| 监控告警 | 只有结构化日志和审计入口，缺 metrics / alert | 生产故障定位和响应不充分 |
| 支付 / 直播 | 使用 mock-pay 和模拟直播间 | 不能宣称真实交易或真实推流 |

## 4. 最终演示前计划

1. 重跑基础校验：`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm build`。
2. 启动 Docker MySQL/Redis、server、admin、mobile，完成后台创建商品、启动竞拍、三个移动端窗口交替出价。
3. 验证防狙击延时、封顶成交、结果弹窗、模拟支付和后台订单列表。
4. 刷新或断开移动端，确认 snapshot 恢复最新价格、排名和倒计时。
5. 按 `docs/manual-test.md` 复测本地图片上传、`user_3` 参与竞拍和流拍刷新停留最新场次。
6. 如时间允许，执行 `docker compose -f docker-compose.prod.yml up -d --build` 并记录健康检查。

## 5. 生产化后续计划

| 优先级 | 任务 | 验收口径 |
| --- | --- | --- |
| P0 | 真实认证、角色权限和限流 | admin / bidder 权限隔离，敏感接口不可被伪造 header 调用 |
| P0 | Playwright 全链路 | 后台创建竞拍、两个移动端出价、成交订单和模拟支付可自动化 |
| P0 | Socket.IO 直接出价压测 | 记录成功率、出价 p95、错误和房间隔离结果 |
| P1 | 对账 repair SOP | 审计差异可通过明确命令或人工流程修复 |
| P1 | 生产 compose 新环境实跑 | 新机器按 README 能启动并通过健康检查 |
| P1 | 监控和告警 | 出价拒绝、outbox 失败、对账异常、订单创建失败有可观测指标 |
| P2 | AI 卖点 mock fallback | 无 API Key 时返回确定性 mock，有 Key 时后端安全调用 |

## 6. 推送前检查口径

```powershell
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
```

如 Docker 服务可用，再补：

```powershell
pnpm perf:day12
$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS
docker compose -f docker-compose.prod.yml config
```

Git 提交前必须确认 `docs/learning/` 未进入暂存区或待提交列表。
