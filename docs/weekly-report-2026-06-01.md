# 周报：直播竞拍系统开发进展（2026-05-26 至 2026-06-01）

## 1. 本周概览

本周围绕“直播竞拍主链路可演示、核心出价链路可验证”推进，开发重点从服务端实时事件能力扩展到管理端、移动端、异常场景测试、真实 HTTP 并发压测和 Day 14 演示前补强。

截至本周末，系统已经覆盖核心闭环：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单 -> 模拟支付
```

当前主流程已具备：

- 主播端创建商品、配置竞拍规则、启动 / 取消竞拍、查看订单。
- 移动端直播间、竞拍小卡片、半屏竞拍面板、真实 REST 出价、Socket.IO 实时提醒、结果弹窗和模拟支付入口。
- 服务端 Redis Lua 原子出价、`clientBidId` 幂等、封顶成交、防狙击延时、状态机结算、订单唯一约束和 outbox 广播。
- 服务级 E2E 覆盖主链路和异常链路，真实 HTTP 压测覆盖 30 / 100 并发出价，并完成 Redis / DB / snapshot / 订单一致性校验。

## 2. 本周主要进展

### 2.1 实时通信和快照恢复

- 新增 Socket.IO 实时模块，支持 `room:{roomId}`、`auction:{auctionId}`、`user:{userId}` 房间隔离。
- 支持客户端加入直播间、加入竞拍、请求 snapshot、Socket.IO 出价和 `PING/PONG`。
- 新增 `GET /rooms/:roomId/auctions`、`GET /auctions/:auctionId`、`GET /auctions/:auctionId/snapshot`，snapshot 包含 `serverTime`、`serverSeq`、排行榜、我的最高出价和排名。
- 状态机和出价服务将业务事实写入 `AuctionEvent` outbox，发布器再按房间广播 `BID_ACCEPTED`、`LEADING`、`OUTBID`、`AUCTION_EXTENDED`、`AUCTION_ENDED`、`ORDER_CREATED`、`AUCTION_CANCELLED`。
- outbox 支持 `FAILED` 事件重试，并在 Day 13 补充单进程防重入，避免同一进程内轮询重叠发布。

### 2.2 主播端管理后台

- 管理端从占位页升级为可用工作台，竞拍列表支持状态筛选、刷新、启动竞拍和取消异常竞拍。
- 竞拍列表展示商品图、商品名、卖点标签、起拍价、固定加价、封顶价、当前价 / 成交金额、出价次数、状态和剩余时间。
- 订单列表展示商品、订单、买家、成交金额、订单状态和创建时间。
- 新增商品上架和竞拍规则配置表单，支持商品名称、图片 URL、介绍、卖点标签、直播间 ID、0 元起拍、固定加价、竞拍时长、封顶价、防狙击窗口、延时时长和最大延时次数。
- 前端金额按元输入，提交前转为整数分；核心规则仍由后端校验和状态机兜底。

### 2.3 移动端直播竞拍体验

- 移动端从 mock 页面推进到真实 REST / Socket.IO 联动。
- 首次进入直播间加载房间竞拍列表、竞拍详情和 snapshot，用服务端 `serverTime` 校准倒计时。
- 连接 Socket.IO 后加入直播间和竞拍房间，重连时通过 snapshot 恢复最新状态。
- 前端使用 `serverSeq` 丢弃旧事件，发现跳号时重新拉取 snapshot，避免旧事件覆盖新状态。
- 出价按钮提交真实 `POST /auctions/:auctionId/bids`，生成稳定 `clientBidId`，并展示后端错误码消息。
- 处理领先、被超越、竞拍延时、竞拍结束、订单生成和竞拍取消等实时事件。
- Day 13 补充结果弹窗和模拟支付入口，中拍用户可在收到 `ORDER_CREATED` 后支付，也可以在刷新后从竞拍历史恢复订单号。

### 2.4 出价一致性和结算补强

- 出价热路径继续使用 Redis Lua 原子维护当前价、最高出价人、结束时间、出价次数、排行榜和 `clientBidId` 热幂等键。
- 成功出价后在数据库事务内写入 `Bid`、更新 `AuctionSession` 快照，并写入 `AuctionEvent(BID_ACCEPTED)`。
- 达到封顶价时仍通过 `AuctionStateMachineService` 立即成交，订单创建在状态机事务内完成，并依赖 `Order(auctionId)` 唯一约束防重复订单。
- Redis accepted 但 DB 写失败时，根据 `serverSeq` 尝试安全回滚热状态，并写入审计日志。
- Day 12 压测暴露真实 Redis payload 解析问题和 Redis accepted 后 DB 持久化乱序问题；已补 Redis 返回解析兼容和按 `auctionId` 串行处理。
- Day 13 进一步把同一竞拍的幂等检查、最新 DB 快照读取、Redis Lua 和 DB 持久化整体放入当前单进程 `auctionId` 级队列，降低失败 accepted bid 后续无法安全回滚的风险。

### 2.5 测试、压测和文档

- 新增 Day 10 服务级核心闭环 E2E，覆盖创建商品、创建竞拍、启动、用户端可见、封顶成交和后台订单可见。
- 新增 Day 11 服务级异常场景 E2E，覆盖无人流拍、一人成交、多人连续出价、防狙击延时、封顶成交、运行中取消、重复点击幂等、结束 / 取消后拒绝出价和重连 snapshot 恢复。
- 新增 Day 12 HTTP 压测脚本 `apps/server/src/performance/day12-http-load.ts` 和 k6 HTTP 模板。
- 已在真实 server + MySQL + Redis 环境记录 30 / 100 并发出价数据，并校验 Redis、DB、snapshot 和订单一致性。
- 持续更新 `README.md`、`docs/progress.md`、`docs/api.md`、`docs/architecture.md`、`docs/consistency.md`、`docs/manual-test.md`、`docs/performance-report.md`、`docs/demo-script.md`、`docs/ai-codex-log.md`。
- 新增 `docs/day14-demo-checklist.md`，把 Day 14 演示主链路、已修复问题、待验证项和不能宣称的能力分开记录。

## 3. 具体设计说明

### 3.1 出价链路设计

出价链路采用“Redis 热状态 + DB 权威状态 + 状态机结算”的分层设计：

1. controller 只负责 demo 身份和请求映射。
2. `BidService` 负责业务编排和幂等处理。
3. Redis Lua 一次性校验状态、结束时间、当前价、固定步长、封顶价、最高出价人和 `clientBidId`。
4. Redis accepted 后，DB transaction 写入 `Bid`、更新 `AuctionSession`，并写入 `AuctionEvent` outbox。
5. 封顶成交交回 `AuctionStateMachineService`，避免在出价服务里重复实现结算逻辑。
6. `Bid(auctionId, clientBidId)` 保证出价幂等，`Order(auctionId)` 保证同一竞拍只生成一笔订单。

当前单进程内对同一 `auctionId` 做串行队列，主要解决 Redis accepted 后 DB 持久化失败与后续出价推进之间的顺序问题。这个方案适合当前 MVP 和演示环境，但不适合多实例部署。

### 3.2 实时事件设计

实时事件采用“业务先落库，事件后发布”的 outbox 模式：

- 出价、启动、取消、结束、订单创建等业务事实先写入 `AuctionEvent`。
- `AuctionEventPublisherService` 轮询 `PENDING` / `FAILED` 事件并发布。
- 公共事件发送到 `room:{roomId}` 和 / 或 `auction:{auctionId}`。
- 私有提醒发送到 `user:{userId}`，例如 `LEADING` 和 `OUTBID`。
- 发布成功后标记 `PUBLISHED`，失败后标记 `FAILED` 并记录审计日志。

客户端不依赖历史事件恢复状态。页面加载或重连后先拉 `AUCTION_SNAPSHOT`，再处理增量事件；移动端使用 `serverSeq` 防止旧事件覆盖新快照。

### 3.3 状态机和结算设计

竞拍状态变化集中在 `AuctionStateMachineService`：

- 启动竞拍：`SCHEDULED -> RUNNING`。
- 取消竞拍：`SCHEDULED/RUNNING -> CANCELLED`。
- 到期有最高出价人：`RUNNING -> ENDED_SOLD` 并创建订单。
- 到期无人出价：`RUNNING -> ENDED_UNSOLD`，不生成订单。
- 达到封顶价：立即走成交结算。

订单创建在状态机事务内完成，数据库唯一约束作为最后兜底。这样 timer 重复触发、封顶成交和手动结算都不会绕开同一套状态流转规则。

### 3.4 前端状态设计

管理端和移动端都不复制竞拍状态机：

- 管理端只负责表单输入、金额转分、调用后端接口和展示后端返回状态。
- 移动端以 snapshot 作为唯一完整状态来源，WebSocket 事件只做增量更新和用户提醒。
- 移动端倒计时以服务端 `serverTime` 校准，避免客户端本地时钟漂移。
- 当前用户领先、竞拍结束、已取消、提交中等禁用按钮逻辑只作为体验保护，最终校验仍在服务端。

## 4. 遇到的问题和处理

| 问题 | 影响 | 处理 |
| --- | --- | --- |
| Redis Lua `ZSCORE` 空值返回解析不兼容 | 真实压测时出价接口出现 500 | 兼容 Redis nil / false / 字符串数字返回，并增加单元测试 |
| Redis accepted 后 DB 并发持久化乱序 | 高并发下可能出现 Redis 热状态和 DB 快照不一致 | 先按 `auctionId` 串行 DB 持久化，后续进一步把幂等检查、Redis Lua 和 DB 写入整体排队 |
| outbox 轮询可能同进程重入 | 慢发布时同一批事件可能被重复扫描 | 增加发布循环防重入标记 |
| API 文档有用户订单和 mock-pay，代码未实现 | 成交后演示链路可能 404 | 新增用户竞拍历史、订单详情和模拟支付接口 |
| 移动端只有成交 toast，缺少结果视图 | 成交闭环展示不完整 | 新增结果弹窗和模拟支付入口 |
| 刷新后中拍用户无法恢复订单号 | 错过 `ORDER_CREATED` 后无法支付 | 竞拍历史返回 `orderId` / `orderStatus`，移动端可恢复订单 |
| 压测历史竞拍影响移动端默认选择 | 刷新可能进入旧压测竞拍 | 房间竞拍列表按 `updatedAt` 排序，并支持 `?auctionId=...` 定向进入 |
| 管理端创建商品和创建竞拍是两个接口串行调用 | 商品创建成功但竞拍创建失败时可能留下未绑定商品 | 当前记录为已知边界，后续建议补后端组合事务接口 |

## 5. 验证情况

本周已经执行或记录的主要验证：

- `pnpm --filter @live-auction/server test`
- `pnpm --filter @live-auction/server typecheck`
- `pnpm --filter @live-auction/admin typecheck`
- `pnpm --filter @live-auction/admin build`
- `pnpm --filter @live-auction/mobile typecheck`
- `pnpm --filter @live-auction/mobile build`
- `pnpm test:e2e`
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `pnpm perf:day12`
- `$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS`

真实性能记录：

| 场景 | 结果 | 一致性 |
| --- | --- | --- |
| 30 并发出价 | 23 accepted，7 个受控 `BID_AMOUNT_TOO_LOW`；平均 546.05ms，p95 930.60ms | Redis / DB / snapshot / 订单一致 |
| 100 并发出价 | 80 accepted，20 个受控 `BID_AMOUNT_TOO_LOW`；平均 1905.17ms，p95 3516.74ms | Redis / DB / snapshot / 订单一致 |

说明：以上压测运行在本机 dev server，不代表生产构建或云环境性能。

## 6. 当前风险和边界

- 同一竞拍出价队列是单进程内存方案，多实例部署仍需要 Redis Stream、消息队列、DB claim 或分布式锁。
- per-auction 串行队列提升了一致性，但会增加同场高并发延迟；当前 100 并发本机 dev server p95 约 3.52s。
- Redis/DB 周期自动对账 worker 尚未实现，当前主要依赖失败当场回滚、审计日志和压测校验。
- outbox 已支持 `FAILED` 重试，但还没有退避、重试次数上限和死信队列。
- 真实浏览器双窗口交替出价、断网重连恢复和后台订单页面最终手测仍需在 Day 14 前补记录。
- 1000 Socket.IO 连接压测尚未执行，不能在演示或文档中宣称已完成。
- AI 卖点 / 直播话术已暂缓，不阻塞竞拍主链路。
- 真实支付不在 MVP 范围内，当前仅提供 `mock-pay`。

## 7. 下周计划

1. 完成 Day 14 演示前真实手测：后台创建商品和竞拍、双移动端窗口交替出价、被超越提醒、防狙击延时、成交结果、模拟支付、后台订单确认。
2. 补充断线重连手测记录，验证刷新或重连后 snapshot 能恢复当前价、排名、倒计时和订单状态。
3. 设计并实现 Redis/DB 周期对账任务，覆盖热状态、DB 快照、订单和 outbox 事件的一致性检查。
4. 补充 100 / 1000 Socket.IO 连接压测脚本和报告，验证房间隔离和事件不泄漏。
5. 将单进程 per-auction 队列升级为可跨实例工作的方案，优先评估 Redis Stream、消息队列或 DB claim。
6. 为 outbox 增加退避、重试次数上限和死信队列。
7. 评估是否补后端“创建商品 + 创建竞拍”组合事务接口，消除管理端串行调用的孤立商品风险。
8. 主链路稳定后再补 AI 卖点 / 直播话术，且必须保持无 API Key 时可 fallback 到 deterministic mock。
