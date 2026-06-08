# Serve 模式与 REST API 设计

## 背景

当前项目仅支持 CLI 一次性运行（`pnpm start`），空闲后自动退出。需要新增常驻服务模式，通过 REST API 管理监听任务。

## 架构定位

```
CLI (pnpm task:create / start / clear)
  │
  │  入口脚本位于 bin/，调用 src/ 纯逻辑模块
  │  直接操作文件系统，间隔运行，空闲自动退出
  ▼
tasks/pending/  tasks/processing/  tasks/archive/
  ▲
  │  操作同一份 tasks/ 目录
  │
serve (pnpm serve)
  ├─ Fastify HTTP API (:3099)
  │   ├─ REST 端点 (/tasks, /task, /health)
  │   └─ MCP 端点 (/mcp, JSON-RPC 2.0)
  └─ 内置 Watcher (watch: true, 永不退出)
```

CLI 与 serve 完全隔离，各自独立运行，互不通信。两套配置各自管理，共享 `tasks/` 文件目录。

serve 模式下 `/mcp` 端点与 REST API 共存，自动启用，无需额外配置。

## 配置

serve 通过 `.env` 配置：

```
PORT=3099                    # 服务端口，默认 3099
FEISHU_WEBHOOK_URL=...       # 可选，飞书自定义机器人 webhook 地址
FEISHU_WEBHOOK_SECRET=...    # 可选，飞书机器人签名校验密钥
FEISHU_AT_USERS=ou_xxx,...   # 可选，飞书通知艾特用户 open_id（逗号分隔），配置后切换为 text 消息格式
```

其余配置（`GITLAB_BASE_URL`、`GITLAB_PROJECT_ID`、`GITLAB_PRIVATE_TOKEN`、`pollIntervalMinutes`）沿用现有 `.env` 字段。

> 注意：新增环境变量后需同步更新 `.env.example` 模板文件。

## API 设计

所有 API 暂不鉴权，信任 localhost。

### 接口列表

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `POST /tasks` | body: `{"tag":"..."}` | 创建监听任务，写入 tasks/pending/ |
| `GET /tasks` | query: `?status=pending\|processing\|archive` | 列出指定状态目录下的任务列表 |
| `GET /task` | query: `?tag=release/1.2.3` | 查看单个任务详情，返回最新记录和查询历史 |
| `DELETE /task` | query: `?tag=release/1.2.3` | 从任意目录删除指定任务 |
| `DELETE /tasks` | 无参数 | 清空 pending + processing 下所有任务 |
| `GET /health` | 无参数 | 健康检查，返回 pending/processing 任务数量 |
| `POST /mcp` | body: JSON-RPC 2.0 | MCP 协议端点，提供 5 个工具（create_task / list_tasks / get_task / delete_task / clear_tasks），详见 `docs/plans/2026-06-07-mcp-server-design.md` |

说明：

- `tag` 参数传原始值（如 `release/1.2.3`），无需调用方编码，服务端内部做 `encodeURIComponent` 查找对应任务文件
- `tasks`（复数）用于批量操作和列表查询，`task`（单数）用于单个任务操作

### 状态码约定

| 场景 | 状态码 |
|------|--------|
| 创建成功 | 201 |
| 查询/删除/列表成功 | 200 |
| 请求参数缺失 | 400 |
| 任务不存在 | 404 |
| 任务已存在 | 409 |

### 请求示例

```bash
# 创建任务
curl -X POST http://127.0.0.1:3099/tasks -H 'Content-Type: application/json' -d '{"tag":"release/1.2.3"}'

# 列出所有 pending 任务
curl http://127.0.0.1:3099/tasks?status=pending

# 查看单个任务
curl 'http://127.0.0.1:3099/task?tag=release/1.2.3'

# 删除任务
curl -X DELETE 'http://127.0.0.1:3099/task?tag=release/1.2.3'

# 清空未完结任务
curl -X DELETE http://127.0.0.1:3099/tasks

# 健康检查
curl http://127.0.0.1:3099/health
```

## 模块变更

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/daemon.js` | serve 入口：加载配置 → PID 管理 → 启动 API server → 启动 watcher → 信号处理 |
| `src/server/index.js` | 创建 Fastify 实例，decorate taskManager，注册 routes 插件 |
| `src/server/routes/tasks.js` | `POST /tasks` / `GET /tasks` / `DELETE /tasks` |
| `src/server/routes/task.js` | `GET /task` / `DELETE /task` |
| `src/server/routes/health.js` | `GET /health` |
| `src/task/manager.js` | 任务 CRUD 统一层：createTask / listTasks / getTask / deleteTask / clearUnfinishedTasks，内部复用 task/create.js 与 task/clear.js |
| `src/notify/feishu.js` | 飞书通知适配器：卡片/文本消息构建 + 本地时区时间格式化 + webhook POST + 签名校验（可选）+ @mention 支持 |
| `src/mcp/index.js` | MCP 端点入口：JSON-RPC 2.0 协议处理，工具路由分发 |
| `src/mcp/tools.js` | MCP Tool 定义：5 个工具（create_task / list_tasks / get_task / delete_task / clear_tasks）的 schema + handler |
| `src/shared/schemas.js` | MCP Tool 共用 Zod Schema 定义（tools.js 自转换为 JSON Schema） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/task/runner.js:49` | bugfix: `tagName` 从文件名解析未做 `decodeURIComponent` |
| `src/task/runner.js` | `notify()` 调用增加 `await`，`buildNotification` 增加 `tagName`/`status`/`pipelineId`/`finishedAt` 字段 |
| `src/daemon.js` | 根据 `FEISHU_WEBHOOK_URL` 注入飞书 notifier |
| `src/app.js` | `createApp` 增加 `watch` / `managePid` / `manageSignals` 参数；`start()` 返回 `{ result, abort }` |
| `src/cli.js` | 适配 `start()` 新返回格式 |
| `bin/serve.js` | 入口脚本，调用 `startDaemon()` |
| `package.json` | 新增 `fastify` 依赖，新增 `"serve": "node bin/serve.js"` 脚本 |

### 不变更文件

| 文件 | 说明 |
|------|------|
| `src/cli.js` | 核心逻辑不变，仅适配返回值格式 |
| `src/task/create.js` | 保留，被 task-manager 内部引用 |
| `src/task/clear.js` | 保留，被 task-manager 内部引用 |
| `src/request.js` / `src/notify/platform.js` / `src/expression.js` | 不动 |

### 测试清单

| 文件 | 覆盖内容 |
|------|----------|
| `test/task-manager.test.js` (12 tests) | createTask / listTasks / getTask / deleteTask / clearUnfinishedTasks |
| `test/api-server.test.js` (11 tests) | 所有 6 个路由 + 错误状态码 |
| `test/daemon.test.js` (3 tests) | PID 冲突 / 启动写 PID / 优雅关闭 |
| `test/notify/feishu.test.js` (11 tests) | 飞书卡片构建 / 时区格式化 / 签名计算 / webhook POST / 错误处理 |
| `test/manual-feishu.test.js` (2 tests) | 飞书手动通知测试（serve 模式真实推送验证） |

## PID 文件说明

`tasks/watcher.pid` 用于防止多个 watcher 实例同时运行：

1. 启动时检查 PID 文件是否存在且对应进程存活 → 拒绝启动
2. 启动成功时写入当前进程 PID
3. 退出/中断时（SIGINT/SIGTERM）清理 PID 文件

serve 模式共用同一机制，确保只有一个常驻服务运行。与 CLI 模式的 PID 互斥，两者不能同时运行。

## Watcher 运行模式

| 模式 | 入口 | 空闲行为 | PID 管理 |
|------|------|----------|----------|
| 间隔模式 | `pnpm start` | 无未完结任务时自动退出 | createApp(app.js) 内部管理 |
| 常驻模式 | `pnpm serve` | 空闲时继续轮询，等待新任务 | daemon.js 统一管理 |

## Docker 部署

serve 模式支持通过 Docker 部署：

```bash
# 首次：构建镜像并启动
./bin/docker-up.sh

# 后续：直接用已有镜像启动
./bin/docker-start.sh

# 或使用 docker compose
docker compose up -d
```

配置通过 `.env` 文件注入，`tasks/` 目录挂载为 volume 保存任务状态。

**限制**：Docker 容器内无桌面环境，`osascript` 和 `node-notifier` 在容器中不可用。但可通过配置 `FEISHU_WEBHOOK_URL` 启用飞书通知，并通过 `FEISHU_AT_USERS` 配置 @mention 用户，实现容器环境下的流水线完成提醒。
