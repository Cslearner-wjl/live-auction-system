# 最终可部署差距评估与计划

日期：2026-06-01

本文基于当前仓库代码和未提交 diff 审视结果整理。评估口径分为“演示可用闭环”和“生产化可部署闭环”，避免把本地 demo 能力误写成生产能力。

## 1. 当前结论

当前项目已经跑通核心业务闭环：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单 -> 模拟支付
```

按完整生产化可部署项目衡量，当前完成度约为 **60%-65%**；剩余 **35%-40%** 主要集中在多实例一致性、自动对账、真实浏览器端到端验证、Socket.IO 大连接压测、生产构建部署和运维安全。

按本地演示闭环衡量，当前完成度约为 **80%-85%**；剩余工作主要是真实双窗口联调、断线重连手测记录、最新代码下重跑 30/100 HTTP 压测、补齐 Docker Compose 一键演示流程说明。

## 2. Diff 审视摘要

本轮审视到的主要改动方向：

| 方向 | 当前状态 | 结论 |
| --- | --- | --- |
| 出价一致性 | `BidService` 增加当前单进程 `auctionId` 级队列，Redis accepted 后 DB 失败会安全回滚并写审计 | 适合单进程 demo，多实例前必须替换为跨进程队列、claim 或分布式锁 |
| Redis Lua | 修复 `previousUserLeaderboardAmountFen` 解析；本轮补正 `previousBidCount` 取值为接受前计数 | 避免 DB 失败回滚时 Redis `bid_count` 无法恢复到旧值 |
| outbox 发布 | 发布器增加单进程防重入 | 降低重复轮询风险；多实例仍需事件 claim / lease |
| 用户订单 | 新增竞拍历史、订单详情、模拟支付接口 | 满足移动端成交后结果视图和刷新恢复订单号 |
| 移动端 | 支持 `auctionId` 定向进入、结果弹窗、模拟支付、历史恢复订单 | 演示闭环更完整；真实双窗口和断网重连仍需最终记录 |
| 压测脚本 | 新增真实 HTTP 压测脚本和 k6 模板；本轮将 k6 p95 阈值改为可配置 | 已有 30/100 HTTP 基线，1000 Socket.IO 未覆盖 |
| 文档 | README、API、架构、一致性、性能、手测、演示和 AI 日志均有同步，最终计划已纳入文档索引 | 后续只记录真实执行结果，避免把计划项写成完成项 |

## 3. 距离最终目标的差距

| 模块 | 完成度 | 主要缺口 |
| --- | --- | --- |
| 核心状态机和结算 | 80% | 需要真实多实例重复 timer / 重复结算验证，补状态对账任务 |
| 高并发出价引擎 | 70% | 当前队列只在单进程内有效，多实例不能保证 Redis accepted 与 DB 落库顺序 |
| WebSocket 实时通道 | 70% | 缺少 1000 连接压测、真实断网重连记录、outbox 多实例 claim |
| 管理后台 | 75% | 创建商品和创建竞拍仍是前端串联两个接口，失败时可能留下未绑定商品 |
| 移动端 H5 | 80% | 需要最终双窗口交替出价、结果弹窗、断网重连浏览器记录 |
| 测试和压测 | 65% | 有单元/e2e/HTTP 压测，缺 Playwright 全链路、Socket.IO 连接压测、生产构建压测 |
| 部署和运维 | 50% | 缺生产构建 Docker 镜像、CI、迁移/seed SOP、日志指标和告警 |
| 安全和权限 | 35% | 当前是 demo header 身份，未实现真实认证、权限边界和限流 |

## 4. P0 阻断项

这些事项完成前，不应宣称“生产化可部署”：

1. 跨进程出价顺序机制：使用 Redis Stream、BullMQ、DB claim 或分布式锁替换本地内存队列。
2. Redis/DB 自动对账 worker：定期校验 `AuctionSession`、`Bid`、`Order`、Redis 热 key 和 outbox 事件。
3. outbox 多实例安全发布：增加 claim/lease、重试退避、最大重试次数和死信队列。
4. 真实端到端验证：Playwright 覆盖后台创建、移动端双用户出价、封顶成交、订单和模拟支付。
5. Socket.IO 压测：至少覆盖 100 连接基线，进阶覆盖 1000 连接和房间隔离。
6. 生产部署包：服务端、管理端、移动端 Docker 镜像和 `docker compose` 生产模式启动说明。
7. 安全基线：替换 demo header 身份，增加基础认证、角色校验、请求限流和敏感日志过滤。

## 5. 最终实施计划

### Phase 1：演示闭环冻结

目标：把当前代码整理成可稳定演示的本地闭环。

- 最新代码下重跑 `pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm build`。
- 启动 Docker MySQL/Redis、server、admin、mobile，完成双窗口交替出价手测。
- 覆盖封顶成交、结果弹窗、模拟支付、刷新后恢复订单号。
- 更新 `docs/manual-test.md` 和 `docs/performance-report.md`，只记录真实执行结果。

验收：评审可以按 `docs/demo-script.md` 从商品创建演示到成交订单和模拟支付。

### Phase 2：一致性生产化

目标：消除单进程假设。

- 设计并实现跨进程单竞拍出价队列或 claim 机制。
- 将 Redis accepted、DB 持久化、失败回滚、事件落库纳入可恢复流程。
- 实现 Redis/DB 对账 worker，输出可修复差异报告。
- 为出价失败补偿、封顶并发、结束时刻延时补充真实 Redis/MySQL 集成测试。

验收：多进程或重复请求下仍满足当前价单调、最高价唯一、订单唯一、事件不倒退。

### Phase 3：实时与压测补强

目标：证明 WebSocket 和 API 在目标负载下稳定。

- 增加 Socket.IO 连接压测脚本，覆盖 100 和 1000 连接。
- 记录房间隔离、重连 snapshot、结束事件禁用出价的压测或 e2e 证据。
- 将 k6 HTTP 压测纳入可配置场景，记录生产构建模式下 30/100 并发数据。
- 补 Playwright 浏览器 e2e，覆盖 admin + mobile 关键路径。

验收：`docs/performance-report.md` 有真实 API 与 WebSocket 指标，不再只有服务级 fake 覆盖。

### Phase 4：部署与运维

目标：从“开发可跑”变成“可交付部署”。

- 补服务端、管理端、移动端 Dockerfile。
- 补生产 compose：MySQL、Redis、server、admin 静态站点、mobile 静态站点。
- 固化迁移、seed、健康检查、环境变量和启动顺序。
- 增加结构化日志字段、基础 metrics、错误码统计和 outbox 失败观测。
- 增加 CI：install、typecheck、test、build、docker build。

验收：新机器按文档配置 `.env` 后，可以一键启动并通过健康检查和核心流程验收。

### Phase 5：产品补齐

目标：补齐非阻断但影响完整度的能力。

- 管理端增加后端组合接口，避免商品已创建但竞拍创建失败留下孤儿商品。
- AI 卖点接口按 mock fallback 实现，不阻塞主流程。
- 后台结果页补订单支付状态筛选和详情查看。
- 移动端补更多失败态和弱网提示。

验收：加分功能不破坏核心竞拍链路，缺少外部密钥时仍可演示。

## 6. 推送前检查口径

推送前应完成：

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
```

如本机 Docker 服务已启动，再补：

```bash
pnpm perf:day12
$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS
```

`docs/learning/` 是本地学习目录，不应进入 Git 暂存或提交。

## 7. 主要风险

- 当前 `auctionId` 级内存队列只保证单进程顺序，多实例部署存在竞态风险。
- outbox 防重入只覆盖单进程，多个 server 实例仍可能重复发布同一事件。
- 100 并发出价在本机 dev server 下 p95 已到秒级，生产化需要权衡一致性与延迟。
- demo 身份认证不能用于真实公网部署。
- 真实支付、真实直播推流和多租户权限不是当前范围，演示时必须明确为 mock 或非目标。
