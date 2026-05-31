# 5 分钟演示脚本

本文档用于最终录屏和答辩演示。未实现功能不得在演示时宣称已完成。

## 0. Day 10 可演示范围

Day 10 可以演示服务端闭环、实时协议、主播端创建后台和移动端真实 REST / Socket.IO 联动的已实现部分：

- 后台创建商品，填写商品名称、图片 URL、介绍和卖点标签。
- 后台配置竞拍规则，支持 0 元起拍、固定加价、竞拍时长、封顶价、防狙击窗口、延时时长和最大延时次数。
- 表单提交后创建 `SCHEDULED` 竞拍，列表刷新后可立即启动。
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

Day 10 不应演示为已完成的能力：

- 真实 k6 / Artillery 压测数据。
- 生产级多实例 outbox claim、Redis/DB 自动对账和真实支付。
- AI 生成卖点按钮。

## 1. 演示准备

- 启动后端、后台、移动端、MySQL、Redis。
- 准备一个主播 demo 身份：`admin_1`。
- 准备至少两个用户 demo 身份：`user_1`、`user_2`。
- 准备一个直播间：`room_1`。
- 准备一张可访问的商品图片 URL；竞拍商品和短时竞拍可在后台现场创建。

## 2. 演示流程

| 时间 | 内容 | 重点 |
| --- | --- | --- |
| 第 1 分钟 | 项目背景和架构 | 商品上架到成交订单闭环；服务端集中状态机；Redis 承接热出价 |
| 第 2 分钟 | 主播后台创建商品、配置规则、启动/取消竞拍 | 展示商品上架表单、0 元起拍、固定加价、封顶价、列表刷新和启动按钮 |
| 第 3 分钟 | 移动端进入直播间，多用户真实出价 | 打开 `?userId=user_1` 和 `?userId=user_2` 两个窗口，展示真实 snapshot、倒计时、出价、领先 / 被超越反馈 |
| 第 4 分钟 | 自动延时、封顶价成交、订单生成 | 展示服务端 `endTime` 延长、`ENDED_SOLD` 状态、唯一订单，以及 outbox 派发 `OUTBID`/`LEADING`/`AUCTION_EXTENDED` 的房间目标 |
| 第 5 分钟 | 技术亮点和工程材料 | 状态机、幂等出价、WebSocket 房间隔离、snapshot 恢复、压测结果、AI 协作日志 |

## 3. 讲解要点

- 金额全部使用整数分，避免浮点误差。
- 所有状态流转通过状态机服务，不在 UI 或 Gateway 中分散实现。
- 管理端页面只展示 API 状态并调用管理端接口，不在前端重复实现竞拍状态机；创建页提交前把元转换为整数分。
- 出价使用 `clientBidId` 幂等，避免用户重复点击产生重复出价。
- 出价先通过 Redis Lua 原子接受，再在 DB transaction 内写 Bid、AuctionSession 和 AuctionEvent outbox，避免未落库就广播成功。
- WebSocket 事件按房间隔离，并通过 `serverSeq` 处理乱序。
- 重连后以 snapshot 为准恢复，不依赖历史事件。
- 成交订单通过 `Order(auctionId)` 唯一约束和状态机事务防重复。

## 4. 风险说明

- MVP 单机 timer 适合个人演示，多实例部署需要切换到 Redis delayed queue 或 BullMQ。
- Day 10 已实现管理端创建表单和移动端真实 REST / Socket.IO 接入，但完整端到端创建、启动、出价、成交订单浏览器闭环仍需 Day 11 补手工记录。
- 管理端创建商品和竞拍当前复用两个接口串行调用；如果商品创建成功但竞拍创建失败，可能留下未绑定商品，后续可补后端组合事务接口。
- Redis accepted 但 DB 写失败时会在确认该出价仍是最新 `serverSeq` 后回滚 Redis 热状态，并记录审计日志返回 `BID_PERSISTENCE_FAILED`；后续仍需要补自动对账 worker。
- 当前 outbox 发布器是单进程轮询，多实例部署前需要事件 claim 或分布式锁。
- 真实支付、真实直播推流和完整认证不在 MVP 范围内。
- AI 卖点生成是加分项，缺少 API Key 时必须 fallback 到 mock。

## 5. 最终演示流程

  1. 课题名称 ：保持与最终提交页一致；名称应可被评委快速识别
  2. 团队名称与成员名单 ：列出成员姓名、学校、专业、角色
  3. 分工说明（如小队完成） ：写清每位成员负责的模块，如前端、后端、模型、数据、部署、产品设计等 （我是个人完成）
  4. 核心功能清单 ：建议 3-6 条，按用户路径或系统能力拆分
  5. 端到端使用流程 ：用 5-8 句写清用户从进入系统到拿到结果的完整流程
  6. 在线 Demo 链接 ：应尽量提供可直接访问链接；若需登录，请提供体验账号或录屏替代
  7. 演示视频链接 ：建议3分钟（可加速），展示核心场景、关键功能、亮点与结果；优先公开视频链接
  8. 源代码仓库链接 ：GitHub / GitLab 均可；建议提供主仓库链接、分支说明与最后提交记录
  9. README / 运行说明 ：至少包含项目简介、依赖环境、启动步骤、目录结构、配置说明
  10. 系统架构图 ：建议展示前端、后端、模型层、数据层、外部服务与调用关系
  11. 大模型 / AI 能力使用说明 ：写清使用了哪些模型、API、Agent / RAG / 向量库 / Prompt 方案，以及在系统中的位置
  12. 关键工程难点与解决方案 ：至少写 2-3 个，如并发、延迟、数据清洗、上下文管理、前后端联调、部署问题等
  13. 项目亮点 / 创新点 ：建议 3 条以内，突出与同类方案相比的差异化
  14. 其余材料（可选择性填写）：
        -  性能指标 / 压测结果 ：如响应时延、QPS、成本、模型调用成功率、召回率等
        - Prompt 策略 / Agent 流程图： 建议补充关键 Prompt 模板、工作流说明、失败兜底机制
        - 评测方案与样例结果： 可给出输入样例、输出样例、人工评估或自动评估方法
        - 用户反馈 / 内测记录： 若已有同学、老师、用户试用反馈，可摘录关键结论
