# 技术栈约束

本文档根据 `ChatGPT-直播竞拍全栈开发.pdf` 和项目工程约束整理，用于限定技术选型、架构边界和实现原则。

## 1. 总体原则

- 优先使用 TypeScript 全栈，减少个人开发中的上下文切换。
- 优先采用 monorepo，便于共享类型、事件枚举和 DTO。
- 核心复杂度放在服务端：状态机、出价校验、幂等、结算和 WebSocket 路由。
- 前端负责交互表现和状态展示，不承载关键竞拍业务规则。
- AI 功能是加分项，不能影响竞拍主链路。

## 2. 推荐技术栈

| 层级 | 技术选择 | 约束说明 |
| --- | --- | --- |
| Monorepo | pnpm workspace | 统一依赖和脚本管理 |
| 移动端 H5 | React + TypeScript + Vite | 移动优先，组件化实现直播间和竞拍面板 |
| 移动端状态 | Zustand 或轻量 React state | 避免复杂状态库，重连后以快照恢复 |
| PC 后台 | React + TypeScript + Vite + Ant Design / Arco Design | 快速实现表单、列表、状态操作 |
| 后端 | Node.js + TypeScript，优先 NestJS 或 Fastify | 保持分层清晰，便于测试 |
| ORM | Prisma 或 TypeORM | 金额字段用整数分，约束幂等键和订单唯一性 |
| 数据库 | MySQL 或 PostgreSQL | 存核心业务数据和审计日志 |
| 缓存与并发 | Redis | 热竞拍状态、幂等 key、排行榜、分布式并发控制 |
| 实时通信 | WebSocket 或 Socket.IO | Socket.IO 可降低重连和房间管理成本 |
| 单元测试 | Vitest 或 Jest | 状态机、规则校验、出价引擎必须覆盖 |
| E2E / API 测试 | Playwright 或现有测试框架 | 覆盖核心竞拍闭环和 WebSocket 场景 |
| 压测 | Artillery 或 k6 | 记录 WebSocket 连接、并发出价和延迟 |
| 部署 | Docker Compose | 本地一键启动 MySQL、Redis、后端和前端 |

如需更换技术栈，必须在改动前说明原因、收益和代价。

## 3. 推荐目录结构

```txt
live-auction-system/
  apps/
    admin/
    mobile/
    server/
  packages/
    shared/
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
  .env.example
  AGENTS.md
```

说明：

- `packages/shared` 存放竞拍状态、WebSocket 事件名、DTO 类型和通用错误码。
- `apps/server` 不应从前端项目导入任何 UI 代码。
- `apps/admin` 和 `apps/mobile` 只能通过 API、WebSocket 和 shared 类型依赖后端契约。

## 4. 后端架构约束

后端应采用清晰分层：

```txt
controller/router -> service -> repository/ORM
gateway/socket -> service
```

职责划分：

- Controller / Router：参数校验、身份上下文、响应映射。
- Service：状态机、出价校验、结算、订单创建等业务逻辑。
- Repository / ORM：数据库读写、唯一约束、事务。
- Gateway / Socket：连接管理、房间加入、事件广播。
- Shared：事件名、状态枚举、错误码、DTO。

禁止：

- 在 Controller 中散落状态流转逻辑。
- 在 WebSocket Gateway 中直接改竞拍状态。
- 在多个服务中复制出价规则。
- 在 UI 代码中实现关键竞拍规则。

## 5. 数据库约束

### 5.1 核心表

至少包含：

- `users`
- `live_rooms`
- `auction_items`
- `auction_rules`
- `auction_sessions`
- `bids`
- `orders`
- `auction_events`
- `audit_logs`

### 5.2 金额字段

- 所有金额使用整数分，例如 `startPriceFen`。
- 数据库字段推荐使用整数类型。
- 不允许使用浮点数存储或计算金额。

### 5.3 必要约束

- `bids` 表需要 `auctionId + clientBidId` 唯一约束。
- `orders` 表需要 `auctionId` 唯一约束，避免重复订单。
- 高频查询字段应加索引，例如 `auctionId`、`userId`、`status`、`createdAt`。
- `auction_sessions` 建议保留 `version` 字段，用于乐观锁或对账。

## 6. Redis 约束

推荐 key：

```txt
auction:{auctionId}:state
auction:{auctionId}:current_price_fen
auction:{auctionId}:highest_bidder_id
auction:{auctionId}:end_time_ms
auction:{auctionId}:bid_count
auction:{auctionId}:leaderboard
auction:{auctionId}:client_bid:{clientBidId}
```

使用原则：

- 出价热状态优先存在 Redis。
- 出价校验和当前价更新使用 Redis Lua 或等价原子操作。
- 排行榜使用 Sorted Set。
- 竞拍结束后为热 key 设置 TTL。
- Redis 成功但数据库失败时，需要通过事件表或补偿任务对账。

## 7. WebSocket 约束

### 7.1 房间

```txt
room:{roomId}
auction:{auctionId}
user:{userId}
```

事件只能发送到相关房间或用户，禁止全局广播。

### 7.2 事件

事件名必须从 `packages/shared` 引用：

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

### 7.3 快照优先

客户端首次加载和重连后必须拉取快照。历史事件只用于增量更新，不能作为恢复状态的唯一来源。

## 8. 前端约束

### 8.1 移动端

- 移动优先设计。
- 首屏就是直播间体验，不做营销式落地页。
- 底部半屏竞拍面板。
- 红色主按钮。
- 出价按钮在不可出价状态必须禁用。
- 最后 10 秒可增强视觉紧迫感，但避免引入重型动画库。
- 断线重连后重新拉取 snapshot。

### 8.2 PC 后台

- 优先用组件库提高表单和列表交付速度。
- 页面数量控制在必要范围：竞拍列表、创建商品 / 规则配置、订单列表。
- 后台只做管理操作，不承载实时高频出价逻辑。

## 9. API 约束

### 9.1 用户端 API

```txt
GET    /rooms/:roomId/auctions
GET    /auctions/:auctionId
GET    /auctions/:auctionId/snapshot
POST   /auctions/:auctionId/bids
GET    /users/me/auction-history
GET    /orders/:orderId
POST   /orders/:orderId/mock-pay
```

### 9.2 管理端 API

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

### 9.3 错误格式

```json
{
  "code": "AUCTION_ALREADY_ENDED",
  "message": "当前竞拍已结束",
  "details": {}
}
```

错误码要稳定，错误文案要可展示，不返回堆栈。

## 10. 测试约束

必须优先测试高风险业务：

- 状态机合法和非法流转。
- 规则配置校验。
- 出价校验。
- `clientBidId` 幂等。
- 封顶价立即成交。
- 成交订单唯一。
- 30 和 100 并发出价。
- WebSocket 房间隔离。
- 重连快照恢复。

文档类变更不强制跑测试，但需要校验内容和密钥泄漏风险。

## 11. 安全约束

- 不提交真实 API Key、数据库密码、访问令牌。
- `.env` 不进入版本库。
- `.env.example` 只写占位字段。
- AI 服务密钥只从环境变量读取。
- 前端不得直接调用 AI 服务。
- 日志不得输出完整密钥、完整授权头或敏感个人信息。
- 课题材料或 PDF 中出现的共享密钥不得复制进代码和项目文档。

## 12. 性能和可观测性约束

压测需要记录：

- 场景。
- 环境。
- WebSocket 连接数。
- 出价请求数。
- 成功率。
- 平均延迟。
- P95 延迟。
- 最大延迟。
- 错误。
- 一致性校验结果。

后端日志至少覆盖：

- 竞拍启动。
- 竞拍结束。
- 竞拍取消。
- 出价接受。
- 出价拒绝。
- 竞拍延时。
- 订单创建。
- Redis / 数据库对账失败。

## 13. AI 功能约束

推荐实现“AI 生成卖点 / 直播话术”：

- 输入：商品名称、商品介绍、起拍价、可选目标人群。
- 输出：卖点标签、直播讲解词、竞拍氛围话术。
- 无 AI Key 时返回确定性 mock 内容。
- AI 输出必须可编辑。
- 只在后台调用后端接口，不从浏览器直接调用模型服务。
- 记录调用成功或 fallback，但不记录密钥。
