# 开发流程

本文档根据 `ChatGPT-直播竞拍全栈开发.pdf` 整理，目标是在 15 天内先跑通竞拍闭环，再补实时稳定性、高并发、双端体验和项目材料。

## 1. 总体节奏

| 阶段 | 天数 | 目标 |
| --- | --- | --- |
| 第一阶段：骨架与核心模型 | Day 1 - Day 3 | 搭好工程、数据库、商品和规则配置 |
| 第二阶段：竞拍核心闭环 | Day 4 - Day 10 | 完成出价、WebSocket、状态机、双端主要页面 |
| 第三阶段：稳定性、体验、材料 | Day 11 - Day 15 | 压测、优化、演示、文档、AI 使用沉淀 |

原则：

- 先做可跑通闭环，再做体验细节。
- 出价引擎和状态机优先级高于装饰性 UI。
- 每天都要有可验证交付物。
- 最后 3 天只修 bug、做材料和演示，不再开大功能。

## 2. Day 1：需求拆解、架构设计、Codex 工作规范

目标：把需求变成可执行任务列表。

重点：

- 明确 MVP 边界。
- 确认 monorepo 结构。
- 画出竞拍状态机。
- 建立 README 和基础文档。
- 建立 AI 协作日志。

交付物：

- 仓库初始化。
- `docs/architecture.md` 初稿。
- `docs/api.md` 初稿。
- `docs/websocket-events.md` 初稿。
- GitHub Issues 或本地 TODO 清单。

验收：

- 项目结构清晰。
- 后续开发有明确模块边界。
- 密钥只出现在本地 `.env`，不进入仓库。

## 3. Day 2：数据库模型、Docker 环境、基础后端

目标：后端可以启动，MySQL 和 Redis 可以连接。

核心表：

- `users`
- `live_rooms`
- `auction_items`
- `auction_rules`
- `auction_sessions`
- `bids`
- `orders`
- `auction_events`
- `audit_logs`

重点字段：

- `auction_sessions.status`
- `auction_sessions.currentPriceFen`
- `auction_sessions.endTime`
- `auction_sessions.highestBidderId`
- `auction_sessions.version`
- `bids.clientBidId`
- `orders.auctionId`

交付物：

- `docker-compose.yml`。
- ORM schema。
- `docs/database-schema.md` 与 Prisma schema 对齐。
- 基础 `/health` API。
- seed 脚本生成直播间、主播和测试用户。

验收：

- Docker 能启动数据库和 Redis。
- 后端健康检查正常。
- ORM migration 成功。

## 4. Day 3：主播端商品发布与规则配置 API

目标：后台能创建竞拍商品和规则。

核心 API：

```txt
POST /admin/items
GET /admin/items
GET /admin/items/:id
PATCH /admin/items/:id
POST /admin/auctions
PATCH /admin/auctions/:id/rules
POST /admin/auctions/:id/start
POST /admin/auctions/:id/cancel
```

规则校验：

- 起拍价允许为 `0`。
- 加价幅度必须大于 `0`。
- 封顶价必须大于起拍价。
- 未开始竞拍可修改规则。
- 竞拍中不可修改核心规则。
- 主播可取消异常竞拍。

交付物：

- 商品和竞拍 CRUD。
- DTO 校验。
- 单元测试。
- API 文档更新。

验收：

- 可以创建商品和竞拍。
- 规则非法时返回稳定错误码。
- 测试覆盖起拍价为 `0`、非法加价、非法封顶价、竞拍中修改失败。

## 5. Day 4：竞拍状态机与定时结束机制

目标：竞拍可以开始、结束、成交或流拍。

核心服务：

```txt
AuctionStateMachineService
```

建议方法：

- `startAuction`
- `cancelAuction`
- `finishAuction`
- `settleSoldAuction`
- `settleUnsoldAuction`
- `transitionTo`

状态流转：

```txt
SCHEDULED -> RUNNING
RUNNING -> ENDED_SOLD
RUNNING -> ENDED_UNSOLD
RUNNING -> CANCELLED
```

交付物：

- 状态机服务。
- 结束任务或调度机制。
- 成交订单创建逻辑。
- 状态机单元测试。

验收：

- 可以手动启动竞拍。
- 到时间后能结束。
- 有最高出价人生成订单。
- 无人出价流拍。
- 非法流转抛业务错误。

## 6. Day 5：出价引擎核心

目标：解决高并发出价一致性。

出价 API：

```txt
POST /auctions/:id/bids
```

请求：

```json
{
  "amountFen": 90000,
  "clientBidId": "uuid-from-client"
}
```

必须校验：

- 竞拍为 `RUNNING`。
- 当前时间未超过结束时间。
- 出价金额大于当前价。
- 出价金额符合固定加价幅度。
- 用户不是当前最高出价人。
- 达到封顶价自动成交。
- 结束前 N 秒出价自动延时。
- 同一 `clientBidId` 不重复处理。

推荐实现：

- Redis Lua 脚本原子校验和更新热状态。
- 成功后写入 `bids` 表。
- 写入 `auction_events` / outbox 后再广播 `BID_ACCEPTED`。
- 失败返回明确错误码和原因。
- 达到封顶价触发状态机结算。

建议拆分：

| 子任务 | 目标 | 验收 |
| --- | --- | --- |
| 5.1 出价规则校验 | 先实现清晰的规则校验函数 | 低价、步长、封顶、最高出价人重复出价均有单元测试 |
| 5.2 `clientBidId` 幂等 | 用数据库唯一约束和服务层逻辑兜底 | 相同 `auctionId + clientBidId` 不产生重复出价 |
| 5.3 Redis Lua 原子更新 | 将当前价、最高出价人、出价次数、`serverSeq` 放进 Lua 原子路径 | 30 并发不价格倒退 |
| 5.4 DB 落库和事件 outbox | accepted 后写 Bid、更新 AuctionSession、写 AuctionEvent | DB 失败时不广播成功事件 |
| 5.5 封顶价触发结算 | 达到封顶价后调用状态机结算 | 只生成一个订单 |
| 5.6 并发测试 | 覆盖 30 和 100 并发出价 | 最高价唯一，订单不重复，Redis 与 DB 可对账 |

交付物：

- `BidService.placeBid`。
- Redis Lua 脚本。
- 幂等处理。
- 并发测试。
- `docs/consistency.md` 根据实现更新。

验收：

- 100 并发出价不出现价格倒退。
- 最高出价人唯一。
- 出价记录和当前价一致。
- 封顶价自动成交。
- 重复 `clientBidId` 幂等。

## 7. Day 6：WebSocket 房间、事件协议、断线重连

目标：同一直播间用户看到一致竞拍状态。

房间：

```txt
room:{roomId}
auction:{auctionId}
user:{userId}
```

事件：

```txt
AUCTION_STARTED
AUCTION_SNAPSHOT
BID_ACCEPTED
BID_REJECTED
OUTBID
LEADING
AUCTION_EXTENDED
AUCTION_ENDED
ORDER_CREATED
AUCTION_CANCELLED
PING
PONG
```

重连策略：

- 连接 WebSocket。
- 加入房间。
- 拉取 snapshot。
- 用 snapshot 渲染最新状态。
- 后续应用增量事件。

交付物：

- WebSocket Gateway。
- join / leave 事件。
- 心跳。
- snapshot API。
- `docs/websocket-events.md`。
- 事件 `serverSeq` 和乱序处理测试。

验收：

- 两个浏览器窗口实时同步。
- 断线重连后恢复最新状态。
- 事件不串房。

## 8. Day 7：主播端管理接口补齐

目标：后台具备列表、状态查看、取消竞拍和订单查看能力。

接口：

```txt
GET /admin/auctions?status=
GET /admin/auctions/:id
POST /admin/auctions/:id/cancel
GET /admin/orders
GET /admin/orders/:id
```

列表字段：

- 商品图。
- 商品名。
- 标签。
- 起拍价。
- 固定加价。
- 封顶价。
- 当前出价 / 成交金额。
- 出价次数。
- 状态。
- 剩余时间。
- 操作。

交付物：

- 管理端竞拍列表 API。
- 订单列表 API。
- 取消竞拍广播。
- E2E 测试。

验收：

- 后台能筛选竞拍状态。
- 能查看订单。
- 取消竞拍后用户端收到取消事件。

## 9. Day 8：移动端直播间主页面

目标：搭起用户端主体验。

页面结构：

- 顶部：主播信息、关注、在线人数。
- 中间：模拟直播画面。
- 左侧：评论流 / 出价提醒。
- 底部：输入框、购物车、互动按钮。
- 右下：竞拍商品小卡片。
- 点击卡片：打开半屏竞拍面板。

组件：

```txt
LiveRoomPage
AuctionMiniCard
AuctionPanel
BidStepper
Countdown
BidToast
```

交付物：

- 移动端页面。
- mock 数据。
- 本地出价交互。
- service 层预留。

验收：

- 页面可运行。
- 半屏弹窗可打开关闭。
- 加减按钮和出价按钮有本地反馈。

## 10. Day 9：移动端接入真实 API 和 WebSocket

目标：移动端能真实参与竞拍。

用户状态：

- 无人出价：展示“起拍价”。
- 有人出价：展示“当前最高价”。
- 自己领先：展示“当前您已是最高价”。
- 被超越：展示“你已被超越”。
- 已结束未成交：按钮禁用。
- 已成交：展示成交信息。
- 重连：重新拉 snapshot。

交付物：

- 接入 snapshot API。
- 接入 bid API。
- 接入 WebSocket 事件。
- 出价 `clientBidId`。
- 错误展示。

验收：

- 多窗口测试通过。
- 出价后当前价实时变化。
- 被超越提醒可见。
- 竞拍结束后按钮禁用。

## 11. Day 10：PC 主播后台页面

目标：完成后台可视化闭环。

页面：

```txt
/admin/items
/admin/items/new
/admin/orders
```

表单字段：

- 商品名称。
- 商品图片 URL。
- 商品介绍。
- 起拍价。
- 固定加价幅度。
- 竞拍时长。
- 封顶价。
- 延时窗口。
- 延时时长。
- 最大延时次数。

交付物：

- 竞拍列表。
- 创建商品和竞拍表单。
- 订单列表。
- API service 封装。

验收：

- 后台能创建竞拍。
- 后台能启动竞拍。
- 用户端能看到启动后的竞拍。
- 成交后后台订单列表能看到结果。

## 12. Day 11：端到端联调与异常场景补齐

目标：把“能跑”变成“稳定跑”。

测试场景：

| 场景 | 预期 |
| --- | --- |
| 无人出价到期 | 流拍 |
| 一人出价到期 | 成交并生成订单 |
| 多人连续出价 | 当前价一致，最高价唯一 |
| 结束前出价 | 自动延时 |
| 达到封顶价 | 立即成交 |
| 竞拍中主播取消 | 用户收到取消事件 |
| 用户断线重连 | 拉到最新快照 |
| 用户重复点击出价 | 不重复写入 |
| 自己已是最高价还出价 | 返回“当前您已是最高价” |
| 竞拍已结束还出价 | 返回失败原因 |

交付物：

- E2E 测试。
- `docs/manual-test.md`。
- 主要 bug 修复。

验收：

- 核心链路可稳定演示。
- 难自动化场景有手测脚本。

## 13. Day 12：并发压测与性能优化

目标：得到可以写进答辩材料的性能数据。

压测目标：

- 基础：单直播间 100 在线用户，30 用户同时出价。
- 亮点：单直播间 1000 WebSocket 连接，100 用户并发出价。

记录指标：

- WebSocket 连接数。
- 每秒出价请求数。
- 出价成功率。
- 平均响应时间。
- P95 响应时间。
- Redis 当前价和数据库出价记录一致性。
- 是否出现重复订单。

优化点：

- 热点数据放 Redis。
- 出价使用幂等 key。
- 排行榜使用 Redis Sorted Set。
- 广播只发目标房间。
- 前端倒计时本地计算并用服务端时间校准。
- 数据库加必要索引。

交付物：

- Artillery 或 k6 压测脚本。
- `docs/performance-report.md`。
- 性能瓶颈修复。

验收：

- 压测脚本可运行。
- 性能数据可复现。
- README 能说明并发能力。

## 14. Day 13：竞拍氛围体验与 AI 加分项

目标：提升移动端竞拍感，并落地一个轻量 AI 功能。

体验优化：

- 领先提示。
- 被超越提示。
- 竞拍结束弹窗。
- 成交弹窗。
- 最后 10 秒倒计时增强。
- 评论区插入系统出价消息。
- 商品小卡片展示竞拍状态。

AI 功能：

- 后台创建商品页增加“AI 生成卖点”。
- 输入商品名称、介绍、起拍价、目标用户。
- 后端接口 `/admin/ai/generate-selling-points`。
- 无 API Key 时返回 mock 内容。
- 输出可编辑。

交付物：

- 移动端氛围反馈。
- AI 卖点接口和后台按钮。
- `docs/ai-codex-log.md` 更新。

验收：

- 演示效果明显。
- AI 功能不阻塞主流程。
- 不暴露任何密钥。

## 15. Day 14：部署、文档、可观测性、演示准备

目标：项目从本地代码变成可提交作品。

补齐文档：

```txt
README.md
docs/architecture.md
docs/api.md
docs/database-schema.md
docs/error-codes.md
docs/consistency.md
docs/websocket-events.md
docs/performance-report.md
docs/manual-test.md
docs/ai-codex-log.md
docs/demo-script.md
```

README 应包含：

- 项目介绍。
- 技术栈。
- 核心亮点。
- 本地启动步骤。
- 环境变量说明。
- 演示账号。
- 压测结果。
- 已知限制。

可观测性：

- 后端日志记录状态流转。
- 出价失败原因统计。
- WebSocket 在线人数。
- 压测结果截图。
- Redis key 说明。

交付物：

- 完整 README。
- 演示脚本。
- 可观测性说明。
- 录屏路线。

验收：

- `docker compose up` 后项目能跑。
- 文档不编造不存在功能。
- 演示流程明确。

## 16. Day 15：最终验收、录屏、答辩材料

目标：稳定演示，不再大改。

只做：

- 修复 P0 bug。
- 准备演示数据。
- 录制双端功能演示。
- 录制高并发压测片段。
- 准备答辩讲解。

5 分钟演示顺序：

| 时间 | 内容 |
| --- | --- |
| 第 1 分钟 | 项目背景和架构 |
| 第 2 分钟 | 主播后台创建商品、配置规则、启动竞拍 |
| 第 3 分钟 | 移动端进入直播间，多用户实时出价 |
| 第 4 分钟 | 自动延时、被超越提醒、封顶价成交、订单生成 |
| 第 5 分钟 | Redis、WebSocket、状态机设计、压测结果、Codex 使用沉淀 |

最终验收清单：

| 模块 | 必须达到 |
| --- | --- |
| 主播端 | 创建商品、配置规则、启动竞拍、取消竞拍、查看订单 |
| 用户端 | 进入直播间、查看竞拍、出价、被超越提醒、结果查看 |
| 竞拍规则 | 0 元起拍、固定加价、封顶价、自动延时、异常取消 |
| 实时能力 | WebSocket 房间广播、断线重连、状态快照 |
| 数据一致性 | 出价幂等、最高价唯一、订单不重复 |
| 性能材料 | 至少有 100 并发出价或 1000 WS 连接压测结果 |
| 项目材料 | README、架构文档、接口文档、演示视频、AI 使用记录 |

## 17. 每天和 Codex 的固定协作流程

1. 先写清楚当天目标和验收标准。
2. 让 Codex 先输出实现计划，不直接写代码。
3. 确认计划后，只实现一个模块。
4. 跑测试。
5. 让 Codex review diff，重点找 bug 和竞态问题。
6. 人工 review 核心逻辑。
7. 提交小 commit。
8. 在 `docs/ai-codex-log.md` 记录 AI 做了什么。

通用开发提示词：

```txt
请先阅读 docs/architecture.md、docs/api.md 和 packages/shared。
今天目标是实现【功能名称】。

约束：
1. 不要修改无关模块。
2. 不要引入新的大型依赖，除非说明原因。
3. 金额统一使用整数分。
4. 竞拍状态必须使用 packages/shared 中的枚举。
5. 所有接口需要基础测试。
6. 完成后说明修改了哪些文件、如何验证。

请先输出实现计划，不要直接改代码。
```

通用 Review 提示词：

```txt
请审查当前 diff，重点关注：
1. 是否破坏竞拍状态机。
2. 是否有并发出价一致性问题。
3. 是否可能重复生成订单。
4. 是否可能 WebSocket 广播乱序或漏发。
5. 是否缺少错误处理和测试。

请只输出问题和建议，不要直接修改代码。
```

## 18. 建议主打亮点

第一，状态机清晰。

把待开始、竞拍中、成交、流拍、取消和延时逻辑讲清楚，体现业务复杂度。

第二，Redis 原子出价。

用 Redis Lua 或等价事务化方案保证当前价、最高出价人和排行榜一致，体现技术深度。

第三，WebSocket 房间级隔离和断线快照恢复。

事件只广播给对应房间，断线后靠 snapshot 恢复，不靠历史消息补偿。

第四，AI 协作可追溯。

让 Codex 生成骨架、测试、文档和代码审查，但核心状态机、数据一致性、幂等策略需要人工把关并记录。
