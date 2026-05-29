# 文档索引

当前基线：Day 9 已完成。服务端用户出价 API、Redis Lua 原子出价、幂等、封顶成交、防狙击延时、Socket.IO 房间隔离、断线重连 snapshot、outbox 广播发布、主播端管理后台联调和移动端真实 REST / Socket.IO 联动已落地；正式压测仍为后续目标。

## 必读文档

| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `progress.md` | Day 1-Day 9 进度、Day 10 下一步 | 持续维护 |
| `architecture.md` | 模块边界、状态机、调度、一致性总体设计 | Day 9 已对齐 |
| `api.md` | REST API 契约和已实现范围 | Day 9 已对齐 |
| `websocket-events.md` | WebSocket 房间、事件和快照契约 | Day 9 移动端已接入真实事件 |
| `database-schema.md` | Prisma 数据模型、索引和唯一约束 | Day 2 后持续对齐 |
| `error-codes.md` | 稳定错误码全集 | 随 shared 包更新 |
| `consistency.md` | Redis 与数据库一致性方案 | Day 6 outbox 发布已对齐，后续补对账任务 |

## 验收材料

| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `manual-test.md` | 手工测试清单和执行记录 | Day 9 已补充移动端真实联动入口 |
| `performance-report.md` | 压测环境、结果和一致性校验记录 | 有单元级并发测试记录，暂无真实压测数据 |
| `demo-script.md` | 最终录屏和答辩演示脚本 | 包含 Day 9 移动端真实联动可演示范围 |
| `ai-codex-log.md` | AI 辅助开发过程记录 | 持续维护 |

## 背景材料

| 文档 | 用途 |
| --- | --- |
| `requirements-analysis.md` | 原始需求拆解和验收口径 |
| `tech-stack-constraints.md` | 技术栈、安全、测试和性能约束 |
| `development-process.md` | 15 天开发节奏和每日交付目标 |

## 已清理内容

- `day1-todo.md` 已删除。原因是其中早期待办已完成，继续保留会造成过期信息；进度追踪已迁移到 `progress.md`。
