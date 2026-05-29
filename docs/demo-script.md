# 5 分钟演示脚本

本文档用于最终录屏和答辩演示。未实现功能不得在演示时宣称已完成。

## 0. Day 9 可演示范围

Day 9 可以演示服务端闭环、实时协议、主播端后台工作台和移动端真实 REST / Socket.IO 联动的已实现部分：

- 后台查看竞拍列表、筛选竞拍状态、启动竞拍、取消异常竞拍。
- 后台查看成交订单列表，包含商品、买家、成交金额和订单状态。
- 启动竞拍后进入 `RUNNING`，并注册单机结束 timer。
- 用户端通过 `POST /auctions/:auctionId/bids` 提交有效出价。
- Redis Lua 原子维护当前价、最高出价人、出价次数、排行榜和 `clientBidId` 热幂等键。
- 有效出价落库 `Bid`，更新 `AuctionSession`，并写入 `AuctionEvent(BID_ACCEPTED, outboxStatus=PENDING)`。
- outbox 发布器将已落库事件广播到 `auction:{auctionId}`、`room:{roomId}` 或 `user:{userId}`。
- Socket.IO 支持加入直播间、加入竞拍、请求 snapshot、心跳和 WebSocket 出价。
- 断线重连后可通过 `GET /auctions/:auctionId/snapshot` 或 `requestSnapshot` 恢复 `serverSeq`、当前价、排行榜和用户排名。
- 移动端 H5 可展示主播信息、直播画面、评论流、竞拍小卡片和底部半屏竞拍面板。
- 移动端首次进入直播间会拉取真实房间竞拍列表、竞拍详情和 snapshot。
- 移动端通过 HTTP `POST /auctions/:auctionId/bids` 提交真实出价，生成稳定 `clientBidId` 并展示后端错误消息。
- 移动端 Socket.IO 连接加入 `room:{roomId}` 和 `auction:{auctionId}`，处理 `BID_ACCEPTED`、`LEADING`、`OUTBID`、`AUCTION_EXTENDED`、`AUCTION_ENDED`、`ORDER_CREATED` 和 `AUCTION_CANCELLED`。
- 移动端通过 `serverTime` 校准倒计时，通过 `serverSeq` 丢弃旧事件并在跳号时重新拉 snapshot。
- 防狙击窗口内出价延长 `endTime` 并重排 timer。
- 达到封顶价立即通过状态机成交并生成一个订单。
- 到期后通过状态机结算为成交或流拍。
- 成交订单可通过 `GET /admin/orders` 和 `GET /admin/orders/:orderId` 查询。

Day 9 不应演示为已完成的能力：

- 真实 k6 / Artillery 压测数据。
- 生产级多实例 outbox claim、Redis/DB 自动对账和真实支付。

## 1. 演示准备

- 启动后端、后台、移动端、MySQL、Redis。
- 准备一个主播 demo 身份：`admin_1`。
- 准备至少两个用户 demo 身份：`user_1`、`user_2`。
- 准备一个直播间：`room_1`。
- 准备一件竞拍商品和一场短时竞拍。

## 2. 演示流程

| 时间 | 内容 | 重点 |
| --- | --- | --- |
| 第 1 分钟 | 项目背景和架构 | 商品上架到成交订单闭环；服务端集中状态机；Redis 承接热出价 |
| 第 2 分钟 | 主播后台查看竞拍、筛选状态、启动/取消竞拍 | 展示商品图、标签、起拍价、固定加价、封顶价、剩余时间和操作按钮 |
| 第 3 分钟 | 移动端进入直播间，多用户真实出价 | 打开 `?userId=user_1` 和 `?userId=user_2` 两个窗口，展示真实 snapshot、倒计时、出价、领先 / 被超越反馈 |
| 第 4 分钟 | 自动延时、封顶价成交、订单生成 | 展示服务端 `endTime` 延长、`ENDED_SOLD` 状态、唯一订单，以及 outbox 派发 `OUTBID`/`LEADING`/`AUCTION_EXTENDED` 的房间目标 |
| 第 5 分钟 | 技术亮点和工程材料 | 状态机、幂等出价、WebSocket 房间隔离、snapshot 恢复、压测结果、AI 协作日志 |

## 3. 讲解要点

- 金额全部使用整数分，避免浮点误差。
- 所有状态流转通过状态机服务，不在 UI 或 Gateway 中分散实现。
- 管理端页面只展示 API 状态并调用管理端接口，不在前端重复实现竞拍状态机。
- 出价使用 `clientBidId` 幂等，避免用户重复点击产生重复出价。
- 出价先通过 Redis Lua 原子接受，再在 DB transaction 内写 Bid、AuctionSession 和 AuctionEvent outbox，避免未落库就广播成功。
- WebSocket 事件按房间隔离，并通过 `serverSeq` 处理乱序。
- 重连后以 snapshot 为准恢复，不依赖历史事件。
- 成交订单通过 `Order(auctionId)` 唯一约束和状态机事务防重复。

## 4. 风险说明

- MVP 单机 timer 适合个人演示，多实例部署需要切换到 Redis delayed queue 或 BullMQ。
- Day 9 已实现移动端真实 REST / Socket.IO 接入，但真实多窗口浏览器联动和断网重连仍需补手工记录。
- 管理端真实 MySQL/Redis 浏览器联调已在 2026-05-27 补测通过；移动端真实联动应在演示前用两个用户窗口再走一遍。
- Redis accepted 但 DB 写失败时当前只记录审计日志并返回 `BID_PERSISTENCE_FAILED`，后续还需要自动对账 worker。
- 当前 outbox 发布器是单进程轮询，多实例部署前需要事件 claim 或分布式锁。
- 真实支付、真实直播推流和完整认证不在 MVP 范围内。
- AI 卖点生成是加分项，缺少 API Key 时必须 fallback 到 mock。
