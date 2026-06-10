# 5 分钟演示脚本

本文档用于最终录屏和答辩演示。未实现、未执行或仅属于规划的能力不得宣称已完成。最终提交材料字段见 `docs/final-acceptance.md`。

## 0. 当前可演示范围

可以演示：

- 后台创建商品，填写商品名称、图片 URL 或上传本地图片、介绍和卖点标签。
- 后台配置竞拍规则，包含 0 元起拍、固定加价、竞拍时长、封顶价、防狙击窗口、延时时长和最大延时次数。
- 后台点击“AI 生成竞拍参考”，生成适合人群、卖点话术和参考价格区间；无 `AI_API_KEY` 时可展示 deterministic mock/fallback。
- 后台可编辑 AI 输出，并在创建竞拍时把 AI 参考绑定到新竞拍。
- `POST /admin/auctions/with-item` 在一个事务内创建商品、规则和 `SCHEDULED` 竞拍。
- 后台查看竞拍列表、筛选状态、启动竞拍、取消异常竞拍和查看成交订单。
- 移动端 H5 进入直播间，展示竞拍小卡片、底部半屏面板、商品详情、当前价、规则摘要、参与人数、倒计时和排行榜。
- 移动端竞拍面板展示脱敏 AI 参考卡片：适合人群、参考成交区间、当前价格状态和理性出价提醒。
- 用户端通过 HTTP `POST /auctions/:auctionId/bids` 提交真实出价，服务端返回稳定错误码和用户可读错误消息。
- Redis Lua 原子维护当前价、最高出价人、出价次数、排行榜、`clientBidId` 热幂等键和防狙击延时。
- `BidService` 使用本进程竞拍队列 + Redis 分布式锁保护同一竞拍的 Redis accepted 到 DB 落库顺序。
- 出价成功后落库 `Bid`，更新 `AuctionSession`，写入 `AuctionEvent(BID_ACCEPTED, outboxStatus=PENDING)`。
- outbox 发布器 claim 事件后按 `auction:{auctionId}`、`room:{roomId}`、`user:{userId}` 定向广播，失败可重试，超过最大尝试进入 `DEAD_LETTER`。
- Socket.IO 支持加入直播间、加入竞拍、请求 snapshot、心跳和 WebSocket 出价。
- 断线重连后可通过 `GET /auctions/:auctionId/snapshot` 或 `requestSnapshot` 恢复 `serverSeq`、当前价、排行榜、用户排名和倒计时校准。
- 防狙击窗口内有效出价会延长 `endTime` 并重排 timer。
- 达到封顶价立即通过状态机成交并生成唯一订单。
- 到期后通过状态机结算为成交或流拍。
- 中拍用户可在移动端结果弹窗查看订单号并调用 `POST /orders/:orderId/mock-pay` 模拟支付。
- 服务级 e2e 覆盖无人流拍、一人成交、多人连续出价、防狙击延时、封顶立即成交、运行中取消、重复点击幂等和重连 snapshot 恢复。
- `pnpm perf:day12` 可运行真实 HTTP + MySQL + Redis 并发出价压测，并校验 Redis / DB / snapshot / 订单一致性。
- 已记录真实 HTTP 30 并发出价基线：24 accepted、6 个受控低价拒绝、p95 873.41ms、一致性通过。
- 已记录真实 HTTP 100 并发出价基线：80 accepted、20 个受控 `BID_AMOUNT_TOO_LOW`、平均 1905.17ms、p95 3516.74ms、一致性通过。
- 已记录 Socket.IO 100 连接基线：连接、join、snapshot、PING/PONG 100% 成功，连接 p95 55.47ms，snapshot p95 183.32ms。
- 已记录 Socket.IO 1000 连接基线：连接、join、snapshot、PING/PONG 100% 成功，连接 p95 501.42ms，snapshot p95 1715.04ms。

不应演示为已完成：

- 真实公网在线 Demo。
- Playwright 浏览器全链路测试。
- 真实支付、真实直播推流、真实认证 / 授权 / 限流。
- 生产 compose 在新机器上的实际 build/up 记录。
- 自动修复型 Redis/DB 对账。
- AI 自动出价、AI 参与竞拍状态机、真实鉴定估价或历史成交分析。

## 1. 演示准备

- 启动 MySQL、Redis、后端、后台和移动端。
- 准备主播 demo 身份：`admin_1`。
- 准备用户 demo 身份：`user_1`、`user_2`、`user_3`。
- 准备直播间：`room_1`。
- 准备一张本地商品图片，或一张稳定可访问的商品图片 URL。
- 如果使用默认 seed，先执行 `pnpm --filter @live-auction/server prisma:seed` 清理历史演示数据。

常用地址：

| 入口 | 地址 |
| --- | --- |
| 后端健康检查 | `http://localhost:3000/health` |
| 管理后台 | `http://localhost:5173/admin/items/new` |
| 移动端用户 A | `http://localhost:5174/?roomId=room_1&userId=user_1&auctionId=<auctionId>` |
| 移动端用户 B | `http://localhost:5174/?roomId=room_1&userId=user_2&auctionId=<auctionId>` |
| 移动端用户 C | `http://localhost:5174/?roomId=room_1&userId=user_3&auctionId=<auctionId>` |

## 2. 演示流程

| 时间 | 内容 | 重点 |
| --- | --- | --- |
| 第 1 分钟 | 项目背景和架构 | 商品上架到成交订单闭环；状态机集中；Redis 承接热出价 |
| 第 2 分钟 | 主播后台创建商品、生成 AI 竞拍参考、配置规则、启动竞拍 | 展示 0 元起拍、固定加价、封顶价、防狙击延时、AI 参考可编辑、事务式创建和启动按钮 |
| 第 3 分钟 | 移动端进入直播间，多用户真实出价 | 打开三个用户窗口，展示真实 snapshot、倒计时、出价、领先 / 被超越反馈 |
| 第 4 分钟 | 自动延时、封顶成交、订单生成 | 展示 `endTime` 延长、`ENDED_SOLD`、唯一订单、结果弹窗和模拟支付 |
| 第 5 分钟 | 技术亮点和工程材料 | Redis Lua + 分布式锁、outbox claim/lease、snapshot 恢复、30/100 HTTP 压测、AI 协作日志 |

## 3. 讲解要点

- 金额全部使用整数分，前端只做展示格式化。
- 所有状态流转通过 `AuctionStateMachineService`，不在 UI 或 Gateway 中分散实现。
- 管理端只调用 API 并展示状态；创建页提交前把元转换为整数分，后端继续做规则校验。
- AI 竞拍参考先由后端规则推断整数分价格区间，再由 mock/OpenAI/Ark 生成文案；无 Key 或模型异常时 fallback 到 mock，前端不接触密钥。
- AI 参考只用于主播编辑和用户理性参考，不作为专业鉴定，不承诺真实市场价值，也不参与是否接受出价。
- 出价使用 `clientBidId` 幂等，避免用户重复点击产生重复出价。
- Redis Lua 负责原子校验和热状态更新，Redis 分布式锁保护同一竞拍跨实例关键段。
- 成功出价必须先落库 `Bid`、更新 `AuctionSession`、写 outbox，再由发布器广播，避免未落库就广播成功。
- WebSocket 事件按房间隔离，并通过 `serverSeq` 处理乱序。
- 重连后以 snapshot 为准恢复，不依赖历史事件。
- 成交订单通过 `Order(auctionId)` 唯一约束和状态机事务防重复。
- 对账 worker 当前只检测和写审计，不自动修改价格、赢家或订单。

## 4. 风险说明

- 结束调度仍是 MVP 单机 timer，多实例部署需要 Redis delayed queue、BullMQ 或等价方案。
- 同一竞拍出价路径引入 Redis 锁和串行保护，保证一致性但会增加高并发尾延迟。
- 100 并发本机 dev server p95 约 3.52s，不能作为生产性能承诺。
- Socket.IO 已记录本机 100/1000 连接基线，但仍不能等同于公网生产容量承诺。
- 生产 compose 可用于本地演示，但还没有新机器实跑记录；公网部署还需认证、限流、密钥管理和监控告警。
- AI 竞拍参考是加分项，当前主流程不依赖 AI；演示时不要宣称其为专业鉴定、真实估值或自动决策能力。

## 5. 最终演示验收流程

最终提交页需要填写的 14 项材料已整理到 `docs/final-acceptance.md`：

1. 课题名称。
2. 团队名称与成员名单。
3. 分工说明。
4. 核心功能清单。
5. 端到端使用流程。
6. 在线 Demo 链接。
7. 演示视频链接。
8. 源代码仓库链接。
9. README / 运行说明。
10. 系统架构图。
11. 大模型 / AI 能力使用说明。
12. 关键工程难点与解决方案。
13. 项目亮点 / 创新点。
14. 其余材料。
