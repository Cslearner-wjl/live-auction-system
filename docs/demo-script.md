# 5 分钟演示脚本

本文档用于最终录屏和答辩演示。未实现功能不得在演示时宣称已完成。

## 0. Day 7 可演示范围

Day 7 可以演示服务端闭环、实时协议和主播端后台工作台的已实现部分：

- 后台查看竞拍列表、筛选竞拍状态、启动竞拍、取消异常竞拍。
- 后台查看成交订单列表，包含商品、买家、成交金额和订单状态。
- 启动竞拍后进入 `RUNNING`，并注册单机结束 timer。
- 用户端通过 `POST /auctions/:auctionId/bids` 提交有效出价。
- Redis Lua 原子维护当前价、最高出价人、出价次数、排行榜和 `clientBidId` 热幂等键。
- 有效出价落库 `Bid`，更新 `AuctionSession`，并写入 `AuctionEvent(BID_ACCEPTED, outboxStatus=PENDING)`。
- outbox 发布器将已落库事件广播到 `auction:{auctionId}`、`room:{roomId}` 或 `user:{userId}`。
- Socket.IO 支持加入直播间、加入竞拍、请求 snapshot、心跳和 WebSocket 出价。
- 断线重连后可通过 `GET /auctions/:auctionId/snapshot` 或 `requestSnapshot` 恢复 `serverSeq`、当前价、排行榜和用户排名。
- 防狙击窗口内出价延长 `endTime` 并重排 timer。
- 达到封顶价立即通过状态机成交并生成一个订单。
- 到期后通过状态机结算为成交或流拍。
- 成交订单可通过 `GET /admin/orders` 和 `GET /admin/orders/:orderId` 查询。

Day 7 不应演示为已完成的能力：

- 移动端真实页面实时排名、被超越提醒和断线重连。
- 真实 k6 / Artillery 压测数据。

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
| 第 3 分钟 | 移动端进入直播间，多用户实时出价 | 展示竞拍小卡片、底部面板、当前价、倒计时、出价按钮 |
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
- Day 7 已实现管理端工作台和服务端 WebSocket 协议，但移动端页面仍未接入真实事件；演示时不得把移动端联动描述为已完成。
- 本轮本机 Docker Desktop 未运行，真实 MySQL/Redis 环境下的管理端浏览器联调需要在演示前补测。
- Redis accepted 但 DB 写失败时当前只记录审计日志并返回 `BID_PERSISTENCE_FAILED`，后续还需要自动对账 worker。
- 当前 outbox 发布器是单进程轮询，多实例部署前需要事件 claim 或分布式锁。
- 真实支付、真实直播推流和完整认证不在 MVP 范围内。
- AI 卖点生成是加分项，缺少 API Key 时必须 fallback 到 mock。
