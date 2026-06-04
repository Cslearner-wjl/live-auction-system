# 文档索引

当前基线：2026-06-03 文档整理后。本文档只保留评审和后续维护需要的入口，阶段性 Day 过程记录已合并到最终验收、手测、性能报告和 AI 协作日志中。

## 验收入口

| 文档 | 用途 | 维护口径 |
| --- | --- | --- |
| `final-acceptance.md` | 对齐 `demo-script.md` 第五项的最终提交材料清单 | 最终提交前优先更新 |
| `demo-script.md` | 5 分钟录屏和答辩讲解脚本 | 只讲已实现或已验证能力 |
| `manual-test.md` | 浏览器和本地演示手工验收清单 | 未实测项明确标注待测 |
| `performance-report.md` | 真实压测数据、脚本入口和未完成指标 | 禁止把未执行脚本写成结果 |
| `ai-codex-log.md` | AI 辅助开发和文档整理记录 | 每次实质变更追加记录 |

## 契约文档

| 文档 | 用途 |
| --- | --- |
| `architecture.md` | 系统架构、状态机、出价链路、实时事件和部署边界 |
| `consistency.md` | Redis 热状态、数据库权威状态、outbox 和对账策略 |
| `api.md` | REST API 契约、错误格式和 DTO 示例 |
| `websocket-events.md` | Socket.IO 房间、客户端事件、服务端事件和 snapshot 契约 |
| `database-schema.md` | Prisma 模型、索引、唯一约束和 outbox 字段 |
| `error-codes.md` | 稳定错误码全集 |

## 背景材料

| 文档 | 用途 | 说明 |
| --- | --- | --- |
| `requirements-analysis.md` | 原始需求拆解 | 作为需求基线保留，不作为当前完成度报告 |
| `tech-stack-constraints.md` | 技术栈和工程约束 | 作为约束基线保留，当前实现以契约文档为准 |

## 本地学习材料

`docs/learning/` 是本地学习沉淀目录，不进入 Git 提交范围。每日收尾仍需要更新 `docs/learning/engineering-experience.md`，但最终验收材料不依赖该目录。

## 本轮删减

以下过程性或重复文档已删除，相关事实已迁移到上方入口：

| 已删除文档 | 删减原因 | 替代入口 |
| --- | --- | --- |
| `progress.md` | Day 进度与 README、AI 日志、最终验收重复，且顶部状态已过时 | `final-acceptance.md`、`ai-codex-log.md` |
| `development-process.md` | 15 天计划属于早期规划，已不适合做当前状态入口 | `final-acceptance.md` |
| `day10-result.md` | 阶段成果已被后续最终补强覆盖 | `manual-test.md`、`performance-report.md` |
| `day14-demo-checklist.md` | 演示清单与最终验收、手测清单重复 | `final-acceptance.md`、`manual-test.md` |
| `weekly-report-2026-06-01.md` | 周报与 AI 日志、性能报告重复，且不是最终提交必需材料 | `ai-codex-log.md` |

## 代码审视结论

- 后端实际入口位于 `apps/server/src`：管理端 API、用户端出价 API、状态机、调度器、Redis 出价 store、outbox 发布器、snapshot 服务和对账 worker 已分层实现。
- 共享状态、错误码、WebSocket 事件和 snapshot 类型来自 `packages/shared/src`。
- 前端实际入口位于 `apps/admin/src/App.tsx` 和 `apps/mobile/src/App.tsx`，移动端通过真实 REST + Socket.IO 联动，后台通过组合事务接口创建商品和竞拍。
- 已实现 Redis 分布式出价锁、Redis Lua 原子出价、`clientBidId` 幂等、outbox claim/lease/死信、Redis/DB 对账审计、生产 compose 和 CI。
- 仍不能宣称已完成：真实认证、真实支付、Playwright 浏览器全链路、生产 compose 新机器实跑记录、自动修复型对账。

## 维护规则

- 行为或接口变化时先改契约文档，再同步演示和手测文档。
- 压测、手测、部署只能记录真实执行结果；计划项必须标注为待测或待实现。
- 根 `README.md` 负责快速启动；`docs/README.md` 负责文档导航；不要再新增 Day 过程文档。
