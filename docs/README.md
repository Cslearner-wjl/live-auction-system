# 文档索引

当前基线：Day 13 审查补强中。服务端用户出价 API、Redis Lua 原子出价、幂等、封顶成交、防狙击延时、Socket.IO 房间隔离、断线重连 snapshot、outbox 广播发布、移动端真实 REST / Socket.IO 联动、主播端创建商品 / 配置竞拍 / 启动 / 取消 / 查看订单闭环已落地；Day 12 已补真实 HTTP + MySQL + Redis 并发压测脚本和 30/100 出价基线数据，Day 13 已补用户订单、模拟支付和 Day 14 演示清单。

## 必读文档

| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `progress.md` | Day 1-Day 13 进度、Day 14 下一步 | 持续维护 |
| `final-deployment-plan.md` | 最终可部署差距评估、阻断项和分阶段计划 | 2026-06-01 审视新增 |
| `day14-demo-checklist.md` | Day 14 完整演示前检查清单、已修复问题和剩余风险 | Day 13 审查新增 |
| `day10-result.md` | Day 10 竞拍核心闭环成果、问题和补强记录 | Day 10 已新增 |
| `architecture.md` | 模块边界、状态机、调度、一致性总体设计 | Day 10 已对齐 |
| `api.md` | REST API 契约和已实现范围 | Day 10 已对齐 |
| `websocket-events.md` | WebSocket 房间、事件和快照契约 | Day 9 移动端已接入真实事件 |
| `database-schema.md` | Prisma 数据模型、索引和唯一约束 | Day 2 后持续对齐 |
| `error-codes.md` | 稳定错误码全集 | 随 shared 包更新 |
| `consistency.md` | Redis 与数据库一致性方案 | Day 12 已补 Redis accepted 后单进程按竞拍持久化顺序；后续补跨实例队列和对账任务 |

## 验收材料

| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `manual-test.md` | 手工测试清单和执行记录 | Day 12 已补真实 HTTP 并发压测记录；真实浏览器多窗口和 1000 Socket.IO 仍待补测 |
| `performance-report.md` | 压测环境、结果和一致性校验记录 | 已记录 Day 12 真实 HTTP 30/100 并发出价基线 |
| `demo-script.md` | 最终录屏和答辩演示脚本 | 包含 Day 12 后台创建、移动端出价、异常场景和压测数据可演示范围 |
| `weekly-report-2026-06-01.md` | 2026-05-26 至 2026-06-01 周报 | 已新增 |
| `ai-codex-log.md` | AI 辅助开发过程记录 | 持续维护 |

## 背景材料

| 文档 | 用途 |
| --- | --- |
| `requirements-analysis.md` | 原始需求拆解和验收口径 |
| `tech-stack-constraints.md` | 技术栈、安全、测试和性能约束 |
| `development-process.md` | 15 天开发节奏和每日交付目标 |

## 已清理内容

- `day1-todo.md` 已删除。原因是其中早期待办已完成，继续保留会造成过期信息；进度追踪已迁移到 `progress.md`。
