# AGENTS.md

## 项目定位

这是一个用于监听 GitLab 打 tag 后流水线状态的项目。

目标是：当指定流水线构建完成后，通过本地消息通知提醒使用者。

当前项目仍处于初始化阶段，仓库内可能暂时没有可执行代码，后续能力将基于逐步拆解的任务持续补充。

## 当前范围

当前阶段已建立基础轮询、任务管理和通知能力，serve 模式也已就绪。后续将继续按小步迭代补充功能。

后续任务会逐步补充以下方向：

1. 流水线状态轮询或回调监听方案优化
2. 更多客户端接入场景（如 Web UI）
3. 配置项、运行方式与异常处理策略优化

当前已确认的技术方向：

1. 通知层采用"设备适配器 + `node-notifier` 兜底"策略（CLI 模式）
2. serve 模式支持通过 `FEISHU_WEBHOOK_URL` 环境变量切换为飞书自定义机器人通知
2. 轮询调度基于单次 `setTimeout` 循环
3. 轮询间隔通过 `pollIntervalMinutes` 表达，默认值为 3 分钟
4. 当前先按“单实例监听指定项目下指定 tag 关联流水线”的方案描述
5. Node.js 依赖管理统一使用 `pnpm`
6. macOS 当前确认使用 `osascript` 的 `display alert` 作为阻塞式提醒方案
 7. 已支持通过独立脚本或 API 清理 `tasks/pending` 与 `tasks/processing` 中的未完结任务文件
 8. 当前 watcher 通过 `tasks/watcher.pid` 协调启动复用（CLI 和 serve 互斥）
 9. 支持两种运行模式：间隔模式（`pnpm start`，空闲退出）和常驻 serve 模式（`pnpm serve`，永不退出 + REST API）
10. serve 模式基于 Fastify 同时提供 REST API 与 MCP Streamable HTTP 端点 (`/mcp`)，默认监听 `0.0.0.0:3099`
11. 入口脚本统一位于 `bin/` 目录，源码逻辑位于 `src/`，两者职责分离
12. 已支持通过 Docker 部署常驻服务，提供 `Dockerfile`、`docker-compose.yml` 及 `bin/docker-*.sh` 脚本

## 代码结构

```text
bin/                          ← 纯入口脚本（薄包装，不含业务逻辑）
  watcher.js                  ← pnpm start
  serve.js                    ← pnpm serve
  cli.js                      ← pnpm task:create
  task-clear.js               ← pnpm task:clear
  docker-build.sh             ← docker build
  docker-start.sh             ← docker run
  docker-up.sh                ← docker build + run

src/                          ← 纯源码（可导出模块，无 require.main）
  app.js                      ← 核心编排器 (createApp)
  cli.js                      ← CLI 命令处理 (runCli)
  daemon.js                   ← 常驻模式入口 (startDaemon)
  expression.js               ← 轮询间隔解析
  mcp/
    index.js                  ← MCP Handler 工厂 + JSON-RPC 端点
    tools.js                  ← MCP Tool 定义（5 个 tool 的 schema + handler）
  notify/
    index.js                  ← 统一入口，导出所有适配器
    platform.js               ← 平台通知适配器 (osascript / node-notifier)
    feishu.js                 ← 飞书通知适配器 (webhook 卡片消息)
  request.js                  ← GitLab API 请求
  task/
    create.js                 ← 任务文件创建
    clear.js                  ← 未完结任务清理
    manager.js                ← 任务 CRUD（API 层用）
    runner.js                 ← 轮询处理引擎
  server/
    index.js                  ← Fastify 服务工厂
    routes/
      health.js
      task.js
      tasks.js
  shared/
    parse-record.js           ← parseLatestRecord（去重后唯一实现）
    process.js                ← isProcessAlive + readExistingPid（去重后唯一实现）
    fs.js                     ← listMarkdownFiles + readFileIfExists（去重后唯一实现）
    schemas.js                ← MCP Tool 共用 Zod Schema 定义
```

---
Dockerfile                    ← 容器镜像定义
docker-compose.yml            ← compose 启动配置
.dockerignore                 ← 构建排除文件
.env.example                  ← 环境变量模板，新增变量时需同步更新

## AI 协作约定

在本仓库中工作的 AI 助手应遵循以下规则：

1. 优先读取本文件，理解项目目标、当前范围和约束
2. 当前未明确要求前，不要主动编写业务代码
3. 新增内容应以“小步迭代”为原则，围绕单一任务推进
4. 做设计或实现前，先说明假设、边界和依赖
5. 若需求存在歧义，应先澄清再继续
6. 除非任务明确要求，否则不要引入与当前目标无关的基础设施
7. 每次代码变更完成后，必须同步更新受影响的文档，包括：本文件（AGENTS.md）、`docs/plans/`、`docs/rules/`、`docs/specs/` 中涉及变更模块、路径、架构或业务规则的部分。不需要等用户提醒
8. 每次代码变更完成后，必须同步更新 `README.md`，确保功能描述、命令列表、API 表格、任务清单与实际代码一致。不需要等用户提醒

## 当前已知约束

1. 通知方式预期为本地消息通知
2. 项目目标聚焦于 GitLab 打 tag 后相关流水线的完成提醒
3. 当前能力仍按小步迭代补充，已包含任务创建、未完结任务清理和基础轮询处理能力
4. 已确定通知层优先按设备适配，macOS 使用 `osascript display alert`
5. 已确定轮询触发方式为“本轮结束后再按 `pollIntervalMinutes` 安排下一轮”
6. 当前默认轮询间隔为 3 分钟，配置字段名为 `pollIntervalMinutes`
7. 当前设计范围先聚焦单实例、单项目、指定 tag 关联流水线监听
8. Node.js 包管理工具统一为 `pnpm`，后续安装依赖和执行脚本默认使用 `pnpm`
9. 未适配设备暂由 `node-notifier` 作为通用兜底
10. 未完结任务清理仅影响 `tasks/pending` 和 `tasks/processing` 下的 `.md` 文件，不影响 `tasks/archive`
11. 间隔模式下当 `tasks/pending` 与 `tasks/processing` 都为空时，watcher 应自动退出；serve 模式下空闲时继续轮询
12. 终态通知失败时任务保留在 `processing`，写入 `notify_error` 记录并在后续轮询中重试
13. Docker 容器内无桌面环境，通知层（`osascript` / `node-notifier`）在容器中不可用；Docker 部署仅提供 REST API 任务管理能力
14. serve 模式下可通过 `FEISHU_WEBHOOK_URL` 环境变量切换为飞书群聊自定义机器人通知，同一时间仅一个通知适配器生效
15. 环境变量通过 `.env` 文件管理，新增变量时需同步更新 `.env.example` 模板文件
16. serve 模式下 `/mcp` 端点通过 JSON-RPC 2.0 协议提供 MCP Tool 调用能力，MCP 客户端可通过 POST 请求调用 5 个工具（create_task / list_tasks / get_task / delete_task / clear_tasks）

## 设计文档索引

1. `docs/plans/2026-05-20-gitlab-tag-watcher-design.md`：首版技术实现设计，包含方案选择、组件划分、数据流和异常处理边界
2. `docs/plans/2026-06-05-serve-api-design.md`：serve 模式与 REST API 设计，包含架构定位、API 接口、模块变更
3. `docs/plans/2026-06-07-mcp-server-design.md`：MCP Server 设计，包含工具定义、JSON-RPC 协议实现、与 serve 模式的集成
4. `docs/rules/business-rules.md`：业务规则文档，定义后续 AI 编码时必须遵守的监听范围、查询规则、通知触发规则和重复通知约束
5. `docs/specs/watch-task-state.md`：监听任务状态规格文档，定义任务字段、状态枚举、状态流转和示例对象

## 后续维护方式

每次新增任务时，优先更新或补充本文件中的以下信息：

1. 目标是否发生变化
2. 当前范围是否扩大
3. 是否新增技术约束或运行前提
4. 是否已有明确的实现决策

每次代码变更（包括新增、移动、删除、重构模块）完成后，必须同步更新受影响的文档：

- `README.md`：功能描述、命令列表、API 表格、任务清单
- `AGENTS.md`：代码结构图、当前范围、技术方向
- `docs/plans/`：模块变更、文件路径、架构说明
- `docs/rules/`：业务规则变更
- `docs/specs/`：数据结构、状态定义、目录结构

如果后续出现更细的模块说明、接口设计、运行说明或任务拆解，可以再新增独立文档，并在本文件中补充索引。
