# Serve 模式与 REST API 设计

## 背景

当前项目仅支持 CLI 一次性运行（`pnpm start`），空闲后自动退出。需要新增常驻服务模式，通过 REST API 管理监听任务。

## 架构定位

```
CLI (pnpm task:create / start / clear)
  │
  │  直接操作文件系统，间隔运行，空闲自动退出
  ▼
tasks/pending/  tasks/processing/  tasks/archive/
  ▲
  │  操作同一份 tasks/ 目录
  │
serve (pnpm serve)
  ├─ Fastify HTTP API (:3099)
  └─ 内置 Watcher (watch: true, 永不退出)
```

CLI 与 serve 完全隔离，各自独立运行，互不通信。两套配置各自管理，共享 `tasks/` 文件目录。

## 配置

serve 通过 `.env` 配置：

```
PORT=3099  # 服务端口，默认 3099
```

其余配置（`BASE_URL`、`PROJECT_ID`、`PRIVATE_TOKEN`、`pollIntervalMinutes`）沿用现有 `.env` 字段。

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
| `src/api-server.js` | 创建 Fastify 实例，decorate taskManager，注册 routes 插件 |
| `src/routes/tasks.js` | `POST /tasks` / `GET /tasks` / `DELETE /tasks` |
| `src/routes/task.js` | `GET /task` / `DELETE /task` |
| `src/routes/health.js` | `GET /health` |
| `src/task-manager.js` | 任务 CRUD 统一层：createTask / listTasks / getTask / deleteTask / clearUnfinishedTasks，内部复用 task-create.js 与 task-clear.js |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/task-runner.js:49` | bugfix: `tagName` 从文件名解析未做 `decodeURIComponent` |
| `src/index.js` | `createApp` 增加 `watch` / `managePid` / `manageSignals` 参数；`start()` 返回 `{ result, abort }` |
| `src/cli.js` | 适配 `start()` 新返回格式 |
| `package.json` | 新增 `fastify` 依赖，新增 `"serve": "node src/daemon.js"` 脚本 |

### 不变更文件

| 文件 | 说明 |
|------|------|
| `src/cli.js` | 核心逻辑不变，仅适配返回值格式 |
| `src/task-create.js` | 保留，被 task-manager 内部引用 |
| `src/task-clear.js` | 保留，被 task-manager 内部引用 |
| `src/request.js` / `src/notify.js` / `src/expression.js` | 不动 |

### 测试清单

| 文件 | 覆盖内容 |
|------|----------|
| `test/task-manager.test.js` (12 tests) | createTask / listTasks / getTask / deleteTask / clearUnfinishedTasks |
| `test/api-server.test.js` (11 tests) | 所有 6 个路由 + 错误状态码 |
| `test/daemon.test.js` (3 tests) | PID 冲突 / 启动写 PID / 优雅关闭 |

## PID 文件说明

`tasks/watcher.pid` 用于防止多个 watcher 实例同时运行：

1. 启动时检查 PID 文件是否存在且对应进程存活 → 拒绝启动
2. 启动成功时写入当前进程 PID
3. 退出/中断时（SIGINT/SIGTERM）清理 PID 文件

serve 模式共用同一机制，确保只有一个常驻服务运行。与 CLI 模式的 PID 互斥，两者不能同时运行。

## Watcher 运行模式

| 模式 | 入口 | 空闲行为 | PID 管理 |
|------|------|----------|----------|
| 间隔模式 | `pnpm start` | 无未完结任务时自动退出 | createApp 内部管理 |
| 常驻模式 | `pnpm serve` | 空闲时继续轮询，等待新任务 | daemon.js 统一管理 |
