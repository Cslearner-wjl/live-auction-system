# 性能测试报告

本文档只记录可复现的真实性能数据。当前尚未完成压测，以下为报告模板，不编造结果。

## 1. 测试环境

| 字段 | 内容 |
| --- | --- |
| 日期 | 待填 |
| 机器配置 | 待填 |
| Node.js 版本 | 待填 |
| 数据库 | MySQL，版本待填 |
| Redis | 版本待填 |
| 后端启动方式 | 待填 |
| 压测工具 | Artillery / k6，待定 |

## 2. 场景记录

| scenario | environment | WebSocket connections | bid attempts | success rate | avg latency | p95 latency | max latency | observed errors | consistency verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 并发出价 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| 100 并发出价 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| 1000 WebSocket 连接 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |

## 3. 一致性校验口径

压测结束后必须检查：

- 当前价单调递增，没有价格倒退。
- 最高出价人唯一。
- accepted Bid 数量等于竞拍 `bidCount`。
- `ENDED_SOLD` 竞拍最多只有一个订单。
- Redis 热状态和数据库 `AuctionSession` 可对账。
- WebSocket 客户端没有收到低于最新价格的成功事件。

## 4. 待补充

- 压测脚本路径。
- 原始压测输出。
- 异常日志摘要。
- 优化前后对比。
