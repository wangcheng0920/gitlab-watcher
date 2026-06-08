# gitlab-watcher

用于监听指定 GitLab 项目下、指定 tag 关联流水线状态，并在流水线结束后发送本地提醒。

当前项目仍处于逐步完善阶段，目标先聚焦在**单实例、单项目、指定 tag** 的本地监听，不扩展到多项目、多任务或服务端部署场景。

## 当前已确认方案

1. 轮询触发基于轮询间隔配置，默认每 3 分钟执行一次
2. 当前按文件系统维护监听任务状态，不引入数据库
3. 通知层：CLI 模式采用"设备适配器优先 + `node-notifier` 兜底"策略；serve 模式支持通过 `FEISHU_WEBHOOK_URL` 切换为飞书自定义机器人通知，支持通过 `FEISHU_AT_USERS` 配置艾特用户
4. macOS 当前优先使用 `osascript` 的 `display alert` 作为阻塞式提醒
5. Node.js 依赖管理统一使用 `pnpm`
6. 支持两种运行模式：间隔模式（`pnpm start`，空闲退出）和常驻模式（`pnpm serve`，永不退出 + REST API + MCP Server）
7. serve 模式下 `/mcp` 端点提供基于 `@modelcontextprotocol/sdk` 的 MCP (Model Context Protocol) 协议支持，AI 客户端可直接调用 5 个工具管理监听任务
8. 仓库内提供一套独立的 MCP SDK Fastify PoC，用于验证 `@modelcontextprotocol/sdk` 的正确接入方式和排查常见误用

## 相关文档

1. `docs/plans/2026-05-20-gitlab-tag-watcher-design.md`：技术设计与架构说明
2. `docs/plans/2026-06-05-serve-api-design.md`：serve 模式与 REST API 设计
3. `docs/plans/2026-06-07-mcp-server-design.md`：MCP Server 设计，含工具定义、SDK transport 接入与会话约束
4. `docs/rules/business-rules.md`：业务边界与通知规则
5. `docs/specs/watch-task-state.md`：监听任务状态与文件结构定义
6. `AGENTS.md`：仓库协作上下文与当前约束

## 常用命令

### CLI 模式

```bash
pnpm start                     # 启动 watcher（间隔模式，空闲时自动退出）
pnpm task:create               # 交互式创建监听任务
pnpm task:create -- release/1.2.3      # 直接创建任务并启动 watcher
pnpm task:create -- release/1.2.3 --no-watch   # 只创建任务
pnpm task:clear                # 清空未完结任务
pnpm test                      # 运行测试
pnpm test:mcp-sdk              # 运行 MCP SDK Fastify PoC 自动化校验
pnpm test:mcp-sdk:manual       # 手动打印 MCP SDK PoC 每一步响应
pnpm test:notify               # 手动触发本地提醒检查
pnpm test:feishu               # 手动触发飞书通知检查（需配置 FEISHU_WEBHOOK_URL）
```

### Serve 模式（常驻服务）

```bash
pnpm serve                     # 启动常驻服务 + API server (:3099)
```

REST API：

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `POST /tasks` | body: `{"tag":"..."}` | 创建监听任务 |
| `GET /tasks` | query: `?status=pending\|processing\|archive` | 列出任务列表 |
| `GET /task` | query: `?tag=release/1.2.3` | 查看单个任务详情 |
| `DELETE /task` | query: `?tag=release/1.2.3` | 删除指定任务 |
| `DELETE /tasks` | 无参数 | 清空 pending + processing |
| `GET /health` | 无参数 | 健康检查 |
| `POST /mcp` | body: JSON-RPC 2.0 | MCP 协议端点，提供 5 个工具（见下方说明） |

### MCP 工具（POST /mcp）

通过 MCP 协议可直接调用以下工具，与 REST API 一一对应：

| 工具 | 对应 REST | 参数 | 说明 |
|------|----------|------|------|
| `create_task` | `POST /tasks` | `tag` (string) | 创建监听任务 |
| `list_tasks` | `GET /tasks` | `status` (string, 可选) | 列出任务列表 |
| `get_task` | `GET /task` | `tag` (string) | 查看单个任务详情 |
| `delete_task` | `DELETE /task` | `tag` (string) | 删除指定任务 |
| `clear_tasks` | `DELETE /tasks` | 无参数 | 清空 pending + processing |

MCP 客户端配置示例（Claude Desktop）：

```json
{ "mcpServers": { "gitlab-watcher": { "url": "http://127.0.0.1:3099/mcp" } } }
```

当前生产 `/mcp` 使用 SDK 的 Streamable HTTP transport，但为了便于自动化调用，服务端开启了 JSON response 模式。客户端仍需遵守 SDK 的会话约束：

1. 初始化请求需发送 `Accept: application/json, text/event-stream`
2. 初始化响应会返回 `mcp-session-id`
3. 后续请求需继续携带 `mcp-session-id` 与 `mcp-protocol-version`

### MCP SDK Fastify PoC

仓库另提供一套隔离的 SDK 验证入口，用于验证和诊断当前生产 `/mcp` 的 SDK 接法：

```bash
pnpm test:mcp-sdk
pnpm test:mcp-sdk:manual
pnpm test:mcp-sdk:manual -- --stateless
pnpm test:mcp-sdk:manual -- --no-hijack
pnpm test:mcp-sdk:manual -- --sse
```

用途：

1. 验证 `McpServer` + `StreamableHTTPServerTransport` 在 Fastify 下的最小可行接法
2. 观察初始化后 `mcp-session-id`、`mcp-protocol-version` 与响应模式的实际行为
3. 复现常见误用，如无状态 transport 复用或关闭 `reply.hijack()`

```bash
# 示例
curl -X POST http://127.0.0.1:3099/tasks -H 'Content-Type: application/json' -d '{"tag":"release/1.2.3"}'
curl 'http://127.0.0.1:3099/task?tag=release/1.2.3'
curl http://127.0.0.1:3099/health
```

## 配置

通过 `.env` 文件配置（参考 `.env.example`）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `GITLAB_PRIVATE_TOKEN` | 是 | GitLab 个人访问令牌 |
| `GITLAB_BASE_URL` | 是 | GitLab API 地址 |
| `GITLAB_PROJECT_ID` | 是 | GitLab 项目 ID |
| `PORT` | 否 | serve 模式 HTTP 端口，默认 3099 |
| `FEISHU_WEBHOOK_URL` | 否 | 飞书自定义机器人 webhook 地址，配置后 serve 模式使用飞书通知 |
| `FEISHU_WEBHOOK_SECRET` | 否 | 飞书机器人签名校验密钥（选填） |
| `FEISHU_AT_USERS` | 否 | 飞书通知艾特用户 open_id（逗号分隔），配置后通知切换为 text 格式 + `@` 提醒 |

> 新增环境变量后需同步更新 `.env.example` 模板文件。

## 运行模式

| 模式 | 入口 | 空闲行为 | 适用场景 |
|------|------|----------|----------|
| 间隔模式 | `pnpm start` | 无未完结任务时自动退出 | 一次性监听，用完即走 |
| 常驻模式 | `pnpm serve` | 空闲时继续轮询，等待新任务 | 后台持续运行，通过 API 管理任务 |

两种模式共享同一份 `tasks/` 目录，通过 `tasks/watcher.pid` 互斥，不能同时运行。

## Docker 部署

```bash
pnpm install                       # 同步依赖（确保 pnpm-lock.yaml 最新）
docker compose up -d               # 构建镜像 + 启动容器
```

常用管理命令：

```bash
docker compose up -d --build       # 源码有改动时，强制重建镜像
docker compose down                # 停止并删除容器
docker compose logs -f             # 查看实时日志
```

> **注意**：容器内无桌面环境，`osascript` / `node-notifier` 不可用。Docker 部署需配置 `FEISHU_WEBHOOK_URL` 以启用飞书通知。

## 典型使用流程

```bash
# 交互式创建任务，并按提示决定是否立即开始监听
pnpm task:create

# 直接创建任务并立即开始监听（默认行为）
pnpm task:create -- release/1.2.3

# 只创建任务，稍后再手动启动 watcher
pnpm task:create -- release/1.2.3 --no-watch
pnpm start
```

说明：

1. `pnpm start`：启动当前 watcher 入口（间隔模式，空闲退出）
2. `pnpm serve`：启动常驻服务，同时开启 HTTP API 和后台轮询
3. `pnpm task:create`：交互式创建一个新的监听任务，会依次提示输入 tag 和是否立即开始监听
4. `pnpm task:create -- <tag>`：直接用指定 tag 创建任务，并默认立即启动 watcher，例如 `pnpm task:create -- release/1.2.3`
5. `pnpm task:create -- <tag> --no-watch`：只创建任务，不立即启动 watcher
6. `pnpm task:clear`：清空未完结任务，只删除 `tasks/pending/` 和 `tasks/processing/` 下的 `.md` 文件
7. `pnpm test`：运行现有测试
8. `pnpm test:notify`：手动触发一次本地提醒检查；在 macOS 下应弹出需要手动关闭的 alert

补充约定：

1. 交互模式会先显示 `Input tag:`，再显示 `Start listening now?`
2. tag 可以直接使用原始值，例如 `release/1.2.3`，不需要手动转换为文件名
3. 创建成功后会输出对应任务文件路径
4. 直接传参时默认立即开始监听；如只想创建任务可追加 `--no-watch`
5. 推荐通过 `pnpm task:create -- <tag>` 传入 tag，避免参数被 `pnpm` 本身解析
6. 如果同一 tag 已存在于 `tasks/pending/`、`tasks/processing/` 或 `tasks/archive/*/`，命令会直接报错
7. `pnpm task:clear` 不会删除 `tasks/archive/` 下的归档历史，也不会清理非 `.md` 文件
8. 如果创建任务时 watcher 已经在运行，CLI 会复用现有 watcher，并输出 `task created, watcher already running`
9. watcher 运行期间会在 `tasks/watcher.pid` 写入当前进程号；正常退出或手动中断时会清理该文件
10. 当前代码中的轮询间隔配置字段为 `pollIntervalMinutes`；未提供时默认值为 `3`

## 任务列表

- [x] 基于轮询间隔的单次定时器轮询机制
- [x] 文件系统维护监听任务状态
- [x] 设备适配器优先的通知层设计
- [x] Mac 使用 `osascript` 的 `display alert` 实现阻塞式提醒
- [x] 通过命令行创建监听任务，支持交互式输入、直接传参与创建后立即开始监听
- [x] 通过独立脚本清空未完结任务，保留 archive 历史
- [x] 终态通知失败后记录 `notify_error` 并在后续轮询中重试
- [x] 使用 `tasks/watcher.pid` 避免重复启动 watcher
- [x] 常驻服务模式 + REST API（`pnpm serve`）
- [x] serve 模式飞书自定义机器人通知（卡片消息 + 本地时区）
- [x] 飞书通知 @mention 支持（text 消息模式 + `<at>` 标签）
- [x] tag 文件名编码/解码一致性修复
- [x] MCP Server 端点 (`/mcp`)，提供 5 个工具供 AI 客户端调用
- [x] MCP SDK Fastify PoC 与手动诊断脚本
- [ ] Windows 系统提醒适配
- [ ] 多项目监听支持、项目配置管理
