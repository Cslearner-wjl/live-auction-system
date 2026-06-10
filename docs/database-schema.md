# 数据库设计契约

本文档定义 Day 2 之后 Prisma schema 的目标结构。默认数据库为 MySQL，字段命名使用 Prisma camelCase；如落库使用 snake_case，应通过 `@map` / `@@map` 显式映射。

## 1. 通用约定

- 主键使用字符串 ID，演示环境可用 `user_1`、`auction_1` 这类可读 ID。
- 金额全部使用整数分，字段名以 `Fen` 结尾。
- 时间字段使用 `DateTime`，由 API 层序列化为 ISO 8601。
- 所有表保留 `createdAt` 和 `updatedAt`，事件表可只追加不更新。
- 软删除不是 MVP 必须项，不提前引入。

## 2. User

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 用户 ID |
| `displayName` | String | 是 | 无 |  | 展示名 |
| `maskedName` | String | 是 | 无 |  | 前端展示脱敏名 |
| `role` | String | 是 | `bidder` | idx `role` | `admin` 或 `bidder` |
| `createdAt` | DateTime | 是 | now |  | 创建时间 |
| `updatedAt` | DateTime | 是 | now |  | 更新时间 |

## 3. LiveRoom

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 直播间 ID |
| `title` | String | 是 | 无 |  | 直播间标题 |
| `hostUserId` | String | 是 | 无 | idx `hostUserId` | 主播 / 管理员用户 ID |
| `status` | String | 是 | `LIVE` | idx `status` | `LIVE`、`CLOSED` |
| `createdAt` | DateTime | 是 | now |  | 创建时间 |
| `updatedAt` | DateTime | 是 | now |  | 更新时间 |

## 4. AuctionItem

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 商品 ID |
| `name` | String | 是 | 无 | idx `name` | 商品名 |
| `imageUrl` | String | 是 | 无 |  | 商品图 URL |
| `description` | String | 是 | 无 |  | 商品描述 |
| `sellingPoints` | Json | 是 | `[]` |  | 卖点标签数组 |
| `createdById` | String | 是 | 无 | idx `createdById` | 创建人 |
| `createdAt` | DateTime | 是 | now |  | 创建时间 |
| `updatedAt` | DateTime | 是 | now |  | 更新时间 |

## 5. AuctionRule

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 规则 ID |
| `startPriceFen` | Int | 是 | 无 |  | 起拍价，允许 0 |
| `incrementFen` | Int | 是 | 无 |  | 固定加价幅度，必须大于 0 |
| `durationSeconds` | Int | 是 | 无 |  | 竞拍时长 |
| `capPriceFen` | Int | 是 | 无 |  | 封顶价 |
| `antiSnipingWindowSeconds` | Int | 是 | `0` |  | 防狙击窗口 |
| `extensionSeconds` | Int | 是 | `0` |  | 单次延时时长 |
| `maxExtensionCount` | Int | 是 | `0` |  | 最大延时次数，0 表示不延时 |
| `createdAt` | DateTime | 是 | now |  | 创建时间 |
| `updatedAt` | DateTime | 是 | now |  | 更新时间 |

规则校验在服务层完成：`startPriceFen >= 0`、`incrementFen > 0`、`capPriceFen > startPriceFen`、`durationSeconds > 0`。

## 6. AuctionSession

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 竞拍 ID |
| `roomId` | String | 是 | 无 | idx `roomId` | 直播间 ID |
| `itemId` | String | 是 | 无 | idx `itemId` | 商品 ID |
| `ruleId` | String | 是 | 无 | unique `ruleId` | 规则 ID |
| `status` | String | 是 | `SCHEDULED` | idx `status` | 竞拍状态 |
| `startTime` | DateTime? | 否 | null | idx `startTime` | 实际开始时间 |
| `endTime` | DateTime? | 否 | null | idx `endTime` | 当前结束时间，延时后更新 |
| `startPriceFen` | Int | 是 | 无 |  | 起拍价快照 |
| `currentPriceFen` | Int | 是 | 无 |  | 当前价 |
| `incrementFen` | Int | 是 | 无 |  | 固定加价快照 |
| `capPriceFen` | Int | 是 | 无 |  | 封顶价快照 |
| `highestBidderId` | String? | 否 | null | idx `highestBidderId` | 当前最高出价人 |
| `bidCount` | Int | 是 | `0` |  | 有效出价次数 |
| `extendedCount` | Int | 是 | `0` |  | 已延时次数 |
| `serverSeq` | Int | 是 | `0` |  | 单场事件序列号 |
| `version` | Int | 是 | `1` |  | 乐观锁 / 对账版本 |
| `createdAt` | DateTime | 是 | now |  | 创建时间 |
| `updatedAt` | DateTime | 是 | now |  | 更新时间 |

建议复合索引：

- `@@index([roomId, status])`
- `@@index([status, endTime])`
- `@@index([itemId, status])`

## 7. Bid

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 出价 ID |
| `auctionId` | String | 是 | 无 | idx `auctionId` | 竞拍 ID |
| `userId` | String | 是 | 无 | idx `userId` | 出价用户 |
| `amountFen` | Int | 是 | 无 | idx `amountFen` | 出价金额 |
| `clientBidId` | String | 是 | 无 | unique with `auctionId` | 客户端幂等 ID |
| `serverSeq` | Int | 是 | 无 | idx `auctionId, serverSeq` | 接受出价时的事件序列 |
| `status` | String | 是 | `ACCEPTED` | idx `status` | `ACCEPTED` 或 `REJECTED` |
| `rejectReason` | String? | 否 | null |  | 拒绝原因错误码 |
| `createdAt` | DateTime | 是 | now | idx `createdAt` | 创建时间 |

必要约束：

- `@@unique([auctionId, clientBidId])`
- `@@index([auctionId, serverSeq])`
- `@@index([auctionId, amountFen])`

## 8. Order

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 订单 ID |
| `auctionId` | String | 是 | 无 | unique `auctionId` | 竞拍 ID，同一竞拍只能一个订单 |
| `itemId` | String | 是 | 无 | idx `itemId` | 商品 ID |
| `buyerId` | String | 是 | 无 | idx `buyerId` | 买家 ID |
| `amountFen` | Int | 是 | 无 |  | 成交金额 |
| `status` | String | 是 | `PENDING_PAYMENT` | idx `status` | `PENDING_PAYMENT`、`PAID`、`CLOSED` |
| `paidAt` | DateTime? | 否 | null |  | 模拟支付时间 |
| `createdAt` | DateTime | 是 | now |  | 创建时间 |
| `updatedAt` | DateTime | 是 | now |  | 更新时间 |

必要约束：

- `@@unique([auctionId])`
- `@@index([buyerId, status])`

## 9. AuctionEvent

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 事件 ID，对应 WebSocket `eventId` |
| `auctionId` | String | 是 | 无 | idx `auctionId` | 竞拍 ID |
| `roomId` | String | 是 | 无 | idx `roomId` | 直播间 ID |
| `type` | String | 是 | 无 | idx `type` | 事件类型 |
| `serverSeq` | Int | 是 | 无 | unique with `auctionId` | 单场单调递增序列 |
| `payload` | Json | 是 | 无 |  | 事件 payload |
| `outboxStatus` | String | 是 | `PENDING` | idx `outboxStatus` | `PENDING`、`PROCESSING`、`PUBLISHED`、`FAILED`、`DEAD_LETTER` |
| `publishAttemptCount` | Int | 是 | `0` |  | outbox 发布尝试次数 |
| `publishClaimedBy` | String? | 否 | null |  | claim 当前事件的发布器实例 |
| `publishClaimedUntil` | DateTime? | 否 | null | idx with `outboxStatus` | claim lease 过期时间 |
| `lastPublishError` | String? | 否 | null |  | 最近一次发布失败原因，最多 500 字符 |
| `publishedAt` | DateTime? | 否 | null |  | 广播成功时间 |
| `createdAt` | DateTime | 是 | now | idx `createdAt` | 创建时间 |

必要约束：

- `@@unique([auctionId, serverSeq])`
- `@@index([outboxStatus, createdAt])`
- `@@index([outboxStatus, publishClaimedUntil])`

## 10. AuditLog

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid / demo ID | PK | 审计日志 ID |
| `actorUserId` | String? | 否 | null | idx `actorUserId` | 操作人 |
| `action` | String | 是 | 无 | idx `action` | 操作类型 |
| `auctionId` | String? | 否 | null | idx `auctionId` | 关联竞拍 |
| `roomId` | String? | 否 | null | idx `roomId` | 关联直播间 |
| `clientBidId` | String? | 否 | null | idx `clientBidId` | 关联出价幂等 ID |
| `eventId` | String? | 否 | null | idx `eventId` | 关联事件 |
| `metadata` | Json | 是 | `{}` |  | 脱敏上下文 |
| `createdAt` | DateTime | 是 | now | idx `createdAt` | 创建时间 |

日志不得记录完整密钥、完整授权头或敏感个人信息。

## 11. AiAuctionInsight

AI 竞拍参考助手持久化表。该表保存后台生成或编辑后的参考内容，允许先生成未绑定竞拍的草稿，再在 `POST /admin/auctions/with-item` 创建商品和竞拍时绑定 `itemId` / `auctionId`。AI 结果只用于参考展示，不参与出价、状态机或订单结算。

| 字段 | 类型 | 必填 | 默认值 | 索引 / 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `id` | String | 是 | cuid | PK | AI 参考 ID |
| `itemId` | String? | 否 | null | idx `itemId` | 关联商品，生成前可为空 |
| `auctionId` | String? | 否 | null | idx `auctionId` | 关联竞拍，生成前可为空 |
| `source` | String | 是 | `mock` |  | `mock`、`openai`、`ark`、`fallback` |
| `targetAudience` | Json | 是 | 无 |  | 适合人群数组 |
| `sellingPointTags` | Json | 是 | 无 |  | 卖点标签数组 |
| `liveScript` | String | 是 | 无 |  | 直播讲解词 |
| `atmosphereCopy` | String | 是 | 无 |  | 竞拍氛围话术 |
| `suggestedStartPriceFen` | Int? | 否 | null |  | 建议起拍价，单位分 |
| `suggestedDealMinFen` | Int? | 否 | null |  | 建议成交区间下限，单位分 |
| `suggestedDealMaxFen` | Int? | 否 | null |  | 建议成交区间上限，单位分 |
| `suggestedCapPriceFen` | Int? | 否 | null |  | 建议封顶价，单位分 |
| `cautionPriceFen` | Int? | 否 | null |  | 谨慎价，单位分 |
| `priceReasoning` | String | 是 | 无 |  | 价格推断说明 |
| `riskNotes` | Json | 是 | 无 |  | 风险提示数组，必须包含价格仅供参考或同义提醒 |
| `confidence` | String | 是 | `medium` |  | `low`、`medium`、`high` |
| `inputSnapshot` | Json | 是 | 无 |  | 生成输入快照；不通过用户端接口返回 |
| `createdById` | String? | 否 | null | idx `createdById` | 生成或绑定的管理员 |
| `createdAt` | DateTime | 是 | now | idx `createdAt` | 创建时间 |
| `updatedAt` | DateTime | 是 | now |  | 更新时间 |

用户端 `GET /auctions/:auctionId/ai-insight` 只返回脱敏字段：`source`、`targetAudience`、参考成交区间、`cautionPriceFen`、`riskNotes`、`confidence`。不得返回成本价、内部市场参考价、完整 prompt、模型原始响应或 `inputSnapshot`。
