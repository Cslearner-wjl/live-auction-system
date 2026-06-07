# 手工测试清单

本文档只记录自动化难以完全覆盖、但最终演示需要确认的真实浏览器和本地环境流程。自动化测试覆盖情况见 `package.json` 脚本和对应服务端测试文件；最终提交材料见 `docs/final-acceptance.md`。

## 1. 当前自动化覆盖

| 范围 | 证据 | 说明 |
| --- | --- | --- |
| 状态机合法 / 非法流转 | `apps/server/src/auction/auction-state-machine.service.test.ts` | 启动、取消、成交、流拍、重复结算和订单唯一性 |
| 竞拍规则校验 | `apps/server/src/auction/auction-rule.validation.test.ts` | 0 元起拍、加价幅度、封顶价、开拍后禁止改规则 |
| 出价引擎 | `apps/server/src/bid/bid.service.test.ts` | 低价、步长、最高价人重复、封顶、幂等、30/100 并发、Redis 锁、DB 失败回滚 |
| WebSocket / outbox | `apps/server/src/realtime/*.test.ts` | 房间隔离、snapshot、发布失败、claim/lease、死信 |
| 用户订单 | `apps/server/src/order/user-orders.service.test.ts` | 竞拍历史、订单详情、买家权限、模拟支付 |
| 服务级闭环 | `apps/server/src/day10-core-loop.e2e.test.ts` | 创建商品、创建竞拍、启动、封顶成交、后台订单可见 |
| 服务级异常场景 | `apps/server/src/day11-auction-scenarios.e2e.test.ts` | 流拍、一人成交、连续出价、延时、取消、幂等、snapshot 恢复 |
| 浏览器全链路 | `tests/e2e/live-auction-flow.spec.ts` | Playwright 覆盖后台创建商品和竞拍、启动竞拍、两个移动端用户交替出价、被超越提示、刷新 / 重连 snapshot、封顶成交、模拟支付、后台订单可见 |
| 真实 HTTP 压测 | `pnpm perf:day12` | 真实 server + MySQL + Redis，30/100 并发出价一致性通过 |

## 2. 最终演示手测清单

| 场景 | 前置条件 | 操作 | 预期结果 | 当前记录 |
| --- | --- | --- | --- | --- |
| 本地依赖启动 | Docker 可用 | `docker compose up -d mysql redis` | MySQL、Redis healthy | 待最终执行 |
| 数据库准备 | 依赖已启动 | `pnpm --filter @live-auction/server prisma:migrate`、`pnpm --filter @live-auction/server prisma:seed` | schema up to date，demo 数据重置 | 已完成 |
| 后端健康检查 | server 已启动 | 打开 `http://localhost:3000/health` | `status=ok`，DB/Redis 均 ok | 待最终执行 |
| 后台创建商品和竞拍 | admin 已启动 | 打开 `/admin/items/new`，填写商品和规则后提交 | 生成 `SCHEDULED` 竞拍，列表可见 | 2026-06-03：基本流程已手测跑通；2026-06-04：Playwright 浏览器 E2E 已覆盖 |
| 0 元起拍 | 创建页起拍价填 `0` | 提交后启动竞拍 | `currentPriceFen=0`，可按固定加价出价 | 单元测试已覆盖；真实页面待最终手测 |
| 后台启动竞拍 | 存在 `SCHEDULED` 竞拍 | 点击启动 | 状态变为 `RUNNING`，移动端可见 | 服务级 e2e 和 Playwright 浏览器 E2E 已覆盖 |
| 三用户实时出价 | 同一竞拍 `RUNNING` | 打开 user_1、user_2、user_3 三个移动端窗口交替出价 | 当前价单调递增，领先 / 被超越提示正确，第三用户可参与 | 2026-06-03：user_3 问题已复测通过；2026-06-04：Playwright 已覆盖 user_1 / user_2 / user_1 交替出价和被超越提示 |
| 防狙击延时 | 竞拍接近结束且设置延时 | 最后窗口内有效出价 | `endTime` 延后，页面收到延时提示 | 服务级 e2e 已覆盖；真实页面待最终手测 |
| 封顶价立即成交 | 竞拍设置封顶价 | 用户出到封顶价 | 状态 `ENDED_SOLD`，仅生成一个订单 | 服务级 e2e、HTTP 压测一致性和 Playwright 浏览器 E2E 已覆盖 |
| 无人流拍 | 启动短时竞拍且无人出价 | 等待到期并刷新移动端 | 状态 `ENDED_UNSOLD`，无订单，刷新后仍停留最新流拍场次 | 2026-06-03：手测发现刷新回退到上一场成交；已修复移动端默认场次选择，已复测通过 |
| 运行中取消 | 竞拍 `RUNNING` | 后台点击取消并填写原因 | 状态 `CANCELLED`，移动端禁用出价 | 服务级 e2e 已覆盖；真实页面待最终手测 |
| 断线 / 刷新恢复 | 已有出价 | 刷新移动端或断开后重连 | snapshot 恢复当前价、排名、倒计时和订单结果 | 服务级 e2e 和 Playwright 浏览器刷新恢复已覆盖 |
| 结果弹窗和模拟支付 | 用户中拍 | 在移动端结果弹窗点击模拟支付 | 订单状态变为 `PAID`，后台订单可见 | Playwright 双窗口浏览器 E2E 已覆盖 |
| P3 界面 polish | admin/mobile 已启动 | 移动端 390x844、360px 打开直播间和竞拍面板；后台宽屏打开竞拍列表 / 创建页 / 订单页 | 移动端半屏面板、价格、出价步进、toast 和结果弹窗无溢出遮挡；后台列表可扫描，按钮状态清晰 | 2026-06-05：Playwright 视觉探针已截取移动端 390/360 和后台宽屏，横向溢出检测均为 0 |
| 后台订单列表 | 已成交或已支付 | 打开 `/admin/orders` | 订单金额、买家、状态正确 | 服务级 e2e 和 Playwright 浏览器 E2E 已覆盖 |
| 生产 compose | Docker 可用 | `docker compose -f docker-compose.prod.yml up -d --build` | server/admin/mobile 可访问 | 2026-06-04：本机实跑通过；server/admin/mobile/mysql/redis 均 healthy，`/health`、后台首页、移动端首页和后台竞拍列表验证通过 |

## 2.1 2026-06-03 手测问题复测结果

| 问题 | 根因 | 修复 | 复测步骤 | 状态 |
| --- | --- | --- | --- | --- |
| 流拍后刷新会回退到上一个已成交页面 | 移动端默认选择竞拍时优先 `ENDED_SOLD`，即使最新列表第一项是刚流拍的场次 | `selectAuction` 改为优先指定 `auctionId`、`RUNNING`、`SCHEDULED`，否则使用后端按 `updatedAt desc` 返回的最新场次 | 创建短时无人竞拍，等待流拍后刷新移动端 | 已复测通过 |
| `user_3` 出价进入一致性补偿且刷新无效 | seed 只有 `user_1` / `user_2`，`user_3` 通过 demo header 后先被 Redis accepted，再因 DB 外键失败触发补偿 | seed 增加 `user_3`；`BidService` 在 Redis 原子出价前校验 / 自动创建 `user_N` demo bidder，非 demo 用户提前返回 `FORBIDDEN` | 重启后端，打开 `?userId=user_3&auctionId=...` 参与交替出价 | 已复测通过 |
| 商品上架只能填写网络 URL，不能选择本地照片 | 后端只保存 http/https URL，管理端没有上传入口 | 新增 `POST /admin/uploads/item-image`，管理端选择本地图片后上传到 `/uploads/items/...` 并自动填入 URL | 在后台创建页选择本地 jpg/png/webp/gif，确认预填 URL 并创建竞拍 | 已复测通过 |

## 3. 压测手工记录

| 场景 | 命令 | 通过标准 | 当前记录 |
| --- | --- | --- | --- |
| HTTP 30 并发出价 | `pnpm perf:day12` | Redis / DB / snapshot / 订单一致 | 已记录：24 accepted，p95 873.41ms，一致性校验通过 |
| HTTP 100 并发出价 | `$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS` | Redis / DB / snapshot / 订单一致 | 已记录：80 accepted，p95 3516.74ms |
| Socket.IO 100 连接 | `$env:SOCKET_CONNECTIONS='100'; pnpm perf:socket; Remove-Item Env:SOCKET_CONNECTIONS` | 连接、join、snapshot、PING/PONG 成功率达标 | 已记录：100% 成功，p95 连接 55.47ms，快照 183.32ms |
| Socket.IO 1000 连接 | `$env:SOCKET_CONNECTIONS='1000'; pnpm perf:socket; Remove-Item Env:SOCKET_CONNECTIONS` | 连接、join、snapshot、PING/PONG 成功率达标 | 已记录：100% 成功，p95 连接 501.42ms，快照 1715.04ms |

## 4. 收尾校验命令

```powershell
pnpm exec playwright install chromium
pnpm test:e2e:ui
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
```

`pnpm test:e2e:ui` 会使用专用端口启动一组隔离服务：server `3100`、admin `5273`、mobile `5274`，避免复用本机已有 `3000/5173/5174` 服务导致 CORS 或数据状态干扰。首次运行 Playwright 前需要安装 Chromium；已安装后命令会直接复用本机浏览器缓存。

如 Docker 环境已启动，再补：

```powershell
pnpm perf:day12
$env:DAY12_BID_ATTEMPTS='100'; pnpm perf:day12; Remove-Item Env:DAY12_BID_ATTEMPTS
```

## 5. 记录格式

```txt
日期：2026.6.3
环境：
场景：进行手工测试
结果：
    健康状态：{"status":"ok","service":"live-auction-server","timestamp":"2026-06-03T09:50:22.737Z","checks":{"database":{"status":"ok","latencyMs":55},"redis":{"status":"ok","latencyMs":310}}}
复测结论：
    1.流拍后刷新回退上一场成交的问题已复测通过，移动端默认竞拍选择逻辑正常。
    2.三人共同竞拍与 user_3 出价的一致性补偿问题已复测通过，刷新后状态恢复正常。
    3.本地照片上传创建商品已复测通过，后台可正常选择文件并自动填充图片地址。
    当前无遗留 bug。
证据：
```
