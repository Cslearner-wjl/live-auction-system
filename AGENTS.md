# AGENTS.md

## 命令环境

- 优先使用 PowerShell 原生命令。
- 完成任务后必须做闭环汇报，简要说明做了什么、改了哪里、整理逻辑和潜在风险。

## 项目使命

构建一套面向抖音直播电商场景的生产化全栈直播竞拍系统。

系统必须完成完整闭环：

```txt
商品上架 -> 规则配置 -> 直播间展示 -> 实时出价 -> 动态排名 -> 竞拍结束 -> 成交订单
```

本仓库虽然是个人开发项目，但所有代码都应按团队评审标准编写：边界清晰、状态流转可预测、服务可测试，并安全处理高并发出价。

## 核心产品需求

### 商家 / 主播 PC 管理后台

需要实现面向商家或直播间主播的 PC 管理后台。

必须支持：

- 创建竞拍商品，包含商品名称、图片、描述和卖点。
- 配置竞拍规则：
  - 起拍价，必须支持 `0` 元起拍。
  - 固定加价幅度。
  - 竞拍时长。
  - 封顶价。
  - 防狙击延时窗口。
  - 延时时长，通常为 10-30 秒。
  - 如实现最大延时次数，需要可配置。
- 查看所有竞拍商品和竞拍进度。
- 仅允许在竞拍开始前修改规则。
- 启动竞拍。
- 取消异常进行中的竞拍。
- 查看已成交、流拍、已取消结果。
- 查看成功结算后生成的订单。

### 用户移动端 H5

需要实现移动优先的直播间体验。

必须支持：

- 模拟直播间。
- 直播间内竞拍小卡片。
- 竞拍详情 / 底部半屏面板。
- 展示商品详情、当前价、起拍价、规则摘要、参与人数。
- 手动出价。
- 实时当前价和排名。
- 关键提醒：
  - 领先。
  - 被超越。
  - 竞拍延时。
  - 竞拍结束。
  - 成交 / 流拍。
- 结果视图和可选模拟支付流程。
- 断线重连后恢复最新竞拍快照。

## 推荐技术栈

除非仓库已经选择了不同技术方案，否则优先使用：

- Monorepo：`pnpm` workspace。
- 前端：React + TypeScript + Vite。
- 移动端状态：Zustand 或轻量 React 状态。
- 管理后台 UI：Ant Design、Arco Design 或等价组件库。
- 后端：Node.js + TypeScript，优先 NestJS 或 Fastify。
- 数据库：MySQL 或 PostgreSQL。
- ORM：Prisma 或 TypeORM。
- 缓存 / 并发：Redis。
- 实时通道：WebSocket 或 Socket.IO。
- 测试：Vitest/Jest 单元测试，Playwright 或 API 级 E2E，Artillery/k6 压测。
- 部署：Docker Compose 本地一键启动。

如果改变上述技术栈，修改代码前必须说明原因和取舍。

## 期望仓库结构

优先采用：

```txt
live-auction-system/
  apps/
    admin/          # PC 管理后台
    mobile/         # 移动端 H5 直播间
    server/         # 后端 API 和 WebSocket 服务
  packages/
    shared/         # 共享枚举、DTO、事件名、常量
  docs/
    architecture.md
    api.md
    websocket-events.md
    performance-report.md
    manual-test.md
    ai-codex-log.md
    demo-script.md
  docker-compose.yml
  README.md
  AGENTS.md
```

如果现有仓库结构不同，应适配当前结构，不做大规模迁移。

## Codex 工作规则

### 编码前

任何非平凡任务都必须先给出短实现计划。在计划清楚前不要编辑文件。

计划必须包含：

1. 目标。
2. 预计修改文件。
3. 影响的业务规则。
4. 需要新增或更新的测试。
5. 风险，尤其是竞态条件和状态流转风险。

只有在缺少信息会导致错误实现时才提澄清问题。其他情况下，做最小合理假设并记录。

### 范围控制

- 不重写无关模块。
- 不引入大型新依赖，除非说明收益和代价。
- 不做大范围纯格式化改动。
- 不改变公开 API 契约，除非任务明确要求。
- 不把业务逻辑隐藏在 UI 代码里。
- 不在多个服务里重复实现竞拍状态机逻辑。

### 安全与密钥

- 不提交真实 API Key、访问令牌、数据库密码或第三方凭证。
- 真实密钥放在 `.env`。
- 示例字段放在 `.env.example`。
- 如使用 AI 模型提供方，密钥必须从环境变量读取。
- 不得把训练营共享 API Key 硬编码到前端或后端源码。
- 不记录原始密钥或完整授权头。

### 金额与精度

- 所有金额都使用最小货币单位整数存储，例如分。
- 禁止用浮点数做价格计算。
- API 字段名必须体现单位，例如 `startPriceFen`、`currentPriceFen`、`incrementFen`。
- 前端可格式化展示为 `¥850`，但后端和数据库必须存整数。

### 代码风格

- 在可行范围内开启 TypeScript strict mode。
- 使用明确的领域命名，避免泛化命名。
- 保持清晰服务边界：
  - controller/router：请求校验和响应映射。
  - service：业务逻辑。
  - repository/ORM：持久化。
  - gateway/socket：WebSocket 连接和事件路由。
- 任何编码竞拍规则的公开函数都必须有测试。
- 共享枚举和常量必须来自 `packages/shared`，避免散落字符串字面量。

## 领域模型

### 核心实体

后端至少应建模：

- `User`
- `LiveRoom`
- `AuctionItem`
- `AuctionRule`
- `AuctionSession`
- `Bid`
- `Order`
- `AuctionEvent`
- `AuditLog`

### 建议 AuctionSession 字段

```txt
id
roomId
itemId
status
startPriceFen
currentPriceFen
incrementFen
capPriceFen
startTime
endTime
extendedCount
highestBidderId
bidCount
version
createdAt
updatedAt
```

### 建议 Bid 字段

```txt
id
auctionId
userId
amountFen
clientBidId
status
rejectReason
createdAt
```

`auctionId + clientBidId` 必须唯一，用于支持出价幂等。

### 建议 Order 字段

```txt
id
auctionId
itemId
buyerId
amountFen
status
createdAt
updatedAt
```

同一场已成交竞拍不得重复生成订单。

## 竞拍状态机

所有竞拍状态变化都必须通过单一状态机服务。

推荐状态：

```txt
DRAFT
SCHEDULED
RUNNING
ENDED_SOLD
ENDED_UNSOLD
CANCELLED
```

除非有明确理由，不要创建持久化的 `EXTENDED` 状态。延时通常通过更新 `endTime` 表达，竞拍仍保持 `RUNNING`。

### 允许状态流转

```txt
DRAFT -> SCHEDULED
SCHEDULED -> RUNNING
RUNNING -> ENDED_SOLD
RUNNING -> ENDED_UNSOLD
RUNNING -> CANCELLED
SCHEDULED -> CANCELLED
```

非法流转必须抛出业务异常，并由测试覆盖。

### 结算规则

- 当前时间到达 `endTime` 时结束竞拍。
- 有最高出价人时，流转为 `ENDED_SOLD`，并且只生成一个订单。
- 没有有效出价时，流转为 `ENDED_UNSOLD`。
- 出价达到或超过 `capPriceFen` 时，立即流转为 `ENDED_SOLD`。
- 主播取消异常竞拍时，流转为 `CANCELLED` 并广播取消事件。

## 出价引擎要求

这是项目最高风险模块，必须按高并发业务处理。

### 出价输入

```json
{
  "amountFen": 90000,
  "clientBidId": "uuid-from-client"
}
```

### 校验规则

一次出价仅在以下条件全部满足时有效：

1. 竞拍状态为 `RUNNING`。
2. 当前服务器时间小于或等于 `endTime`。
3. 出价人当前不是最高出价人。
4. `amountFen` 大于 `currentPriceFen`。
5. `amountFen - currentPriceFen` 是 `incrementFen` 的倍数，或符合项目明确的固定步长规则。
6. `amountFen` 不超过 `capPriceFen`，除非产品决策明确采用封顶价裁剪。
7. 当前竞拍下的 `clientBidId` 尚未处理过。
8. 竞拍尚未结算或取消。

### 并发要求

并发出价必须保证：

- 当前价不会下降。
- 任意时刻只有一个最高出价人。
- 客户端重试不会创建重复出价记录。
- 一场已成交竞拍只生成一个订单。
- WebSocket 客户端不会收到低于最新已接受价格的事件。
- Redis 状态和数据库状态在失败后可对账和修复。

推荐实现：

- 使用 Redis Lua 脚本或等价原子操作维护热出价状态。
- 如实现排名，使用 Redis Sorted Set。
- 使用数据库唯一约束保证幂等。
- 订单创建必须在状态机事务内完成。
- 记录足够事件用于排查和对账。

### Redis Key 约定

```txt
auction:{auctionId}:state
auction:{auctionId}:current_price_fen
auction:{auctionId}:highest_bidder_id
auction:{auctionId}:end_time_ms
auction:{auctionId}:bid_count
auction:{auctionId}:leaderboard
auction:{auctionId}:client_bid:{clientBidId}
```

竞拍完成后，应为热 key 设置合理 TTL。

## WebSocket 要求

### 房间隔离

必须使用房间级隔离，禁止把竞拍事件全局广播。

推荐房间：

```txt
room:{roomId}
auction:{auctionId}
user:{userId}
```

### 必需事件

事件名定义在 `packages/shared`。

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

### 快照优先原则

客户端不能依赖旧 WebSocket 事件恢复状态。

页面加载或重连时：

1. 建立 WebSocket 连接。
2. 加入直播间或竞拍房间。
3. 请求或拉取 `AUCTION_SNAPSHOT`。
4. 用快照渲染状态。
5. 后续再增量应用实时事件。

### 快照形状

```json
{
  "auctionId": "1",
  "status": "RUNNING",
  "currentPriceFen": 85000,
  "nextBidAmountFen": 90000,
  "highestBidderMaskedName": "张**",
  "myBidAmountFen": null,
  "myRank": null,
  "bidCount": 13,
  "participantCount": 100,
  "endTime": "2026-06-01T10:00:00.000Z",
  "serverTime": "2026-06-01T09:59:51.000Z",
  "leaderboard": []
}
```

必须包含 `serverTime`，用于前端校准倒计时漂移。

## REST API 指南

### 用户端 / 移动端 API

```txt
GET    /rooms/:roomId/auctions
GET    /auctions/:auctionId
GET    /auctions/:auctionId/snapshot
POST   /auctions/:auctionId/bids
GET    /users/me/auction-history
GET    /orders/:orderId
POST   /orders/:orderId/mock-pay
```

### 管理后台 API

```txt
POST   /admin/items
GET    /admin/items
GET    /admin/items/:itemId
PATCH  /admin/items/:itemId
POST   /admin/auctions
GET    /admin/auctions
GET    /admin/auctions/:auctionId
PATCH  /admin/auctions/:auctionId/rules
POST   /admin/auctions/:auctionId/start
POST   /admin/auctions/:auctionId/cancel
GET    /admin/orders
GET    /admin/orders/:orderId
POST   /admin/ai/generate-selling-points
```

### API 错误格式

统一使用：

```json
{
  "code": "AUCTION_ALREADY_ENDED",
  "message": "当前竞拍已结束",
  "details": {}
}
```

禁止向客户端暴露堆栈信息。

## 前端要求

### 移动端 H5

核心组件：

```txt
LiveRoomPage
AuctionMiniCard
AuctionPanel
BidStepper
Countdown
BidToast
AuctionResultModal
LiveCommentList
```

交互要求：

- 使用底部半屏竞拍面板。
- 主按钮使用红色强调。
- 倒计时明显可见。
- 支持一键出价。
- 支持 `+` / `-` 多步调整出价金额。
- 竞拍结束、提交中、已取消、当前用户已领先时禁用出价按钮。
- 清晰展示后端返回的错误。
- 无人出价时展示“起拍价”。
- 有有效出价时展示“当前最高价”。
- 已成交时展示“落槌价”。
- 当前用户领先时展示“当前您已是最高价”。
- 收到 `OUTBID` 事件时展示“你已被超越”。
- 最后 10 秒用轻量视觉变化增强紧迫感。
- 不引入重型动画库，除非仓库已有。

### PC 管理后台

核心页面：

```txt
/admin/items
/admin/items/new
/admin/auctions
/admin/orders
```

列表应展示：

```txt
商品图
商品名
标签
起拍价
固定加价
封顶价
当前出价 / 成交金额
出价次数
竞拍状态
剩余时间
操作按钮
```

操作包括：

- 创建商品。
- 配置规则。
- 启动竞拍。
- 取消异常竞拍。
- 查看订单。
- 可选生成 AI 卖点。

## AI 功能指引

AI 功能是加分项，不得阻塞竞拍主流程。

推荐功能：

```txt
AI 生成卖点 / 直播话术
```

输入：

```txt
商品名称
商品介绍
起拍价
目标人群，可选
```

输出：

```txt
卖点标签
直播讲解词
竞拍氛围话术
```

规则：

- 缺少 AI API Key 时返回确定性的 mock 内容。
- 不从前端直接调用 AI。
- 不向浏览器暴露 AI 凭证。
- AI 输出必须可由主播编辑。
- 日志记录 AI 调用成功还是 fallback 到 mock，但不得记录密钥。

## 测试要求

任何竞拍逻辑变更都必须包含测试。

### 单元测试

必须覆盖：

- 状态机合法流转。
- 状态机非法流转。
- `0` 元起拍。
- 非法加价幅度。
- 封顶价校验。
- 开拍后修改规则失败。
- 出价低于或等于当前价失败。
- 出价不符合加价幅度失败。
- 最高出价人再次出价失败。
- 竞拍结束后出价失败。
- 重复 `clientBidId` 幂等。
- 达到封顶价立即结算。
- 成交竞拍只生成一个订单。
- 流拍不生成订单。

### 并发测试

需要添加测试或脚本覆盖：

- 30 个并发出价。
- 100 个并发出价。
- 多个相同 `clientBidId` 的出价。
- 多个用户并发冲击封顶价。
- 结束时刻出价触发自动延时。

断言：

- 当前价单调递增。
- 最高出价人唯一。
- 出价次数等于接受的出价数。
- 不存在重复订单。
- Redis 状态与数据库状态一致。

### WebSocket 测试

验证：

- 用户可加入竞拍房间。
- 出价成功事件只到达同一竞拍房间用户。
- 事件不会泄漏到其他房间。
- 重连后可拉取最新快照。
- 竞拍结束事件会禁用出价。

### 手工测试

对难以自动化的流程维护 `docs/manual-test.md` 检查清单。

## 性能要求

基线目标：

- 一个直播间至少 100 名在线用户。
- 至少 30 名用户在短时间内尝试出价。

进阶目标：

- 一个直播间 1000 个 WebSocket 连接。
- 至少 100 个并发出价请求。

添加性能测试时，记录：

```txt
scenario
environment
number of WebSocket connections
number of bid attempts
success rate
average latency
p95 latency
max latency
observed errors
consistency verification result
```

结果保存到 `docs/performance-report.md`。

## 可观测性与调试

需要结构化记录：

- 竞拍启动。
- 竞拍结束。
- 竞拍取消。
- 出价接受。
- 出价拒绝及原因。
- 竞拍延时。
- 订单创建。
- Redis / 数据库对账失败。

日志应包含：

```txt
auctionId
roomId
userId
clientBidId
eventId
```

不得记录完整密钥或敏感个人信息。

## 文档要求

行为变化时必须更新文档。

必须维护：

```txt
docs/architecture.md
docs/api.md
docs/websocket-events.md
docs/performance-report.md
docs/manual-test.md
docs/ai-codex-log.md
docs/demo-script.md
```

`docs/ai-codex-log.md` 应记录：

```txt
date
task
prompt summary
files changed
AI-generated parts
human-reviewed decisions
tests run
known issues
```

本项目会评价 AI 辅助开发过程质量，所以日志必须准确。

### 本地学习文档

- `docs/learning/` 是本地学习沉淀目录，不推送到 GitHub。
- 每日工作完成后，必须更新本地 `docs/learning/engineering-experience.md`，把当天遇到的问题、解决方案、可迁移经验、简历表达和面试讲法落实进去。
- 学习文档只能写真实完成或深度设计过的内容；未实现能力必须标注为后续素材，不得写成已完成经验。
- Git 提交前必须确认 `docs/learning/` 未进入暂存区或待提交列表。

## 完成定义

任务完成必须满足：

1. 实现符合请求范围。
2. 竞拍业务规则保持集中且有测试。
3. 相关单元、API、WebSocket 测试通过。
4. 类型检查通过。
5. 如配置 lint，则 lint 通过。
6. 公开 API 或 WebSocket 契约变化已更新文档。
7. 未提交任何密钥。
8. 给出清晰的人类评审摘要。

收尾前运行最接近的校验命令：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

如果这些脚本不存在，检查 `package.json` 并运行对应等价命令。如果还没有测试框架，需要为改动的核心逻辑添加最相关测试。

## Commit 指引

使用小提交。

建议前缀：

```txt
feat:
fix:
test:
docs:
refactor:
perf:
chore:
```

示例：

```txt
feat(server): add atomic bid placement service
test(server): cover concurrent cap-price settlement
feat(mobile): show outbid reminder on websocket event
docs: update websocket event contract
```

## Codex 任务模板

开始任务时使用：

```txt
Goal:
Context:
Constraints:
Files to inspect:
Done when:
Validation commands:
```

示例：

```txt
Goal:
实现运行中竞拍的原子出价。

Context:
使用 Redis 维护热出价状态，使用数据库唯一约束保证幂等。

Constraints:
- 金额使用整数分。
- 所有状态变化经过 AuctionStateMachineService。
- clientBidId 必须幂等。
- 成交竞拍只能生成一个订单。

Files to inspect:
- apps/server/src/auction
- apps/server/src/bid
- packages/shared

Done when:
- 有效出价更新当前价。
- 无效出价返回稳定错误码。
- 100 并发出价不产生重复赢家。
- 测试通过。

Validation commands:
pnpm --filter server test
pnpm --filter server test:e2e
```

## Codex 代码审查清单

收尾前检查：

- 业务规则是否在正确层实现。
- 是否重复实现了状态机逻辑。
- 两个并发请求是否可能产生两个赢家。
- 一场竞拍是否可能创建两个订单。
- 重试是否可能创建重复出价。
- Redis 状态是否能和数据库状态保持一致。
- WebSocket 事件是否只发送到正确房间。
- 重连是否通过快照恢复。
- 错误是否稳定且用户可读。
- 文档是否更新。
- 测试是否有意义，而不是只有快照或表面测试。

## 非目标

除非明确要求，不要投入这些方向：

- 真实支付集成。
- 真实直播推流基础设施。
- 完整认证 / 授权系统，简单 demo 身份即可。
- 原生 iOS / Android 应用。
- 复杂推荐系统。
- 多租户企业权限。
- 生产 Kubernetes 部署。

这些区域应使用简单、诚实、便于演示的 mock 方案。

## 最终提醒

本项目价值最高的部分是：

1. 原子、幂等、高并发出价。
2. 清晰的竞拍状态机。
3. WebSocket 房间隔离和重连快照恢复。
4. 顺滑的移动端出价体验。
5. 完整 demo 和文档。

优先保证这些内容，不要把时间花在装饰性功能上。
