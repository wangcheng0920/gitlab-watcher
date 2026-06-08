# MCP Server 设计

## 背景

当前 serve 模式已通过 Fastify 提供 REST API。需要新增 MCP (Model Context Protocol) 端点，使 AI 客户端（如 Claude Desktop、VS Code Copilot 等）能够通过标准 MCP 协议调用 GitLab 流水线监听能力。

## 架构定位

```
serve (pnpm serve)
  ├─ Fastify HTTP API (:3099)
  │   ├─ REST 端点 (/tasks, /task, /health)
  │   └─ MCP 端点 (/mcp, POST, JSON-RPC 2.0)
  └─ 内置 Watcher (watch: true, 永不退出)
```

MCP 端点与 REST API 共享同一 Fastify 实例，复用 `taskManager` 完成实际业务操作。后台轮询和通知由 serve 模式独立驱动，MCP 端点仅提供按需查询和管理能力。

## 协议选择

采用 `@modelcontextprotocol/sdk` 提供的 **Streamable HTTP** 传输方式，当前仅使用 `POST /mcp` 的 JSON-RPC 2.0 调用链路。生产实现启用 JSON response 模式，便于脚本和测试直接消费响应；SSE 流未作为默认交互方式暴露。传输层使用 session 化 transport，初始化后需要通过 `mcp-session-id` 与 `mcp-protocol-version` 维持同一会话。

## MCP Tools

5 个工具与 REST API 接口一一对应：

| Tool | 对应 REST | 参数 | 说明 |
|------|----------|------|------|
| `create_task` | `POST /tasks` | `tag` (string, required) | 创建监听任务 |
| `list_tasks` | `GET /tasks` | `status` (string, optional: pending/processing/archive) | 列出任务 |
| `get_task` | `GET /task` | `tag` (string, required) | 查看任务详情 |
| `delete_task` | `DELETE /task` | `tag` (string, required) | 删除任务 |
| `clear_tasks` | `DELETE /tasks` | 无 | 清理未完结任务 |

每个工具的 `inputSchema` 以 Zod 定义为真相源，注册到 SDK 后由 SDK 自动暴露为 JSON Schema，供 MCP 客户端用于参数提示和校验。

## JSON-RPC 流程

```
Client                          Server
  │                                │
  ├─ POST /mcp                     │
  │   initialize                   │
  │                                ├─ 200 { result: { capabilities, serverInfo }, headers: { mcp-session-id } }
  │                                │
  ├─ POST /mcp                     │
  │   notifications/initialized    │
  │   + mcp-session-id             │
  │   + mcp-protocol-version       │
  │                                ├─ 202 (空)
  │                                │
  ├─ POST /mcp                     │
  │   tools/list                   │
  │   + mcp-session-id             │
  │   + mcp-protocol-version       │
  │                                ├─ 200 { result: { tools: [...] } }
  │                                │
  ├─ POST /mcp                     │
  │   tools/call                   │
  │   { name, arguments }          │
  │   + mcp-session-id             │
  │   + mcp-protocol-version       │
  │                                ├─ 200 { result: { content: [...] } }
  │                                │
```

服务端按 session 维护独立的 `McpServer + StreamableHTTPServerTransport` 实例。初始化请求创建新 session，后续 `tools/list` 和 `tools/call` 必须携带初始化阶段返回的 `mcp-session-id` 与协商后的 `mcp-protocol-version`，否则请求会被拒绝。

## 模块实现

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/mcp/index.js` | `createMcpHandler` 工厂函数。创建 Fastify 路由处理器，按 session 管理 `McpServer + StreamableHTTPServerTransport` 实例，并把原始请求交给 SDK transport 处理 |
| `src/mcp/tools.js` | `createToolDefinitions` 工厂函数。定义 5 个工具的 name / description / Zod `inputSchema` / handler，handler 委托 `taskManager` 完成实际操作 |
| `src/shared/schemas.js` | MCP Tool 共用的 Zod Schema 定义（`TAG_INPUT` / `STATUS_QUERY`），作为未来扩展的参考 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/server/index.js` | `createApiServer` 增加 `mcpHandler` 可选参数，注册 `POST /mcp` 路由 |
| `src/daemon.js` | `startDaemon` 中调用 `createMcpHandler` 并将 handler 传入 `createApiServer` |
| `package.json` | 新增 `@modelcontextprotocol/sdk`、`zod` 依赖 |

### 复用（不变）

| 模块 | 复用方式 |
|------|---------|
| `src/task/manager.js` | 所有 tool handler 底层委托 taskManager |
| `src/request.js` | 轮询由 serve 模式后台驱动，MCP 不直接调用 |
| `src/shared/` | `parse-record` / `process` / `fs` 不受影响；`schemas.js` 被 MCP tools 导入作为 Zod schema 真相源 |

## 错误处理

| 场景 | JSON-RPC Code | 说明 |
|------|-------------|------|
| 请求 body 解析失败 | `-32700` | Parse error |
| 缺少 `mcp-session-id` | `-32000` | 非初始化请求未带 session header |
| Session 不存在 | `-32000` | session header 无法命中已初始化会话 |
| SDK 参数校验失败 | `-32602` | Invalid params |
| 业务逻辑错误 | 返回 `isError: true` 的 content | 如 tag 重复、任务不存在等 |

## 配置

无需额外配置。serve 模式启动即自动启用 `/mcp` 端点。MCP 客户端配置示例（Claude Desktop）：

```json
{
  "mcpServers": {
    "gitlab-watcher": {
      "url": "http://127.0.0.1:3099/mcp"
    }
  }
}
```

## 设计决策记录

1. **生产实现改用 `McpServer` / `StreamableHTTPServerTransport`**：经过 PoC 验证，之前的“后续请求空响应”问题主要来自 transport 生命周期与请求头使用不当，而不是 SDK 与 Fastify 天生不兼容。当前生产实现按 session 维护 transport，并在 Fastify 路由中使用 `reply.hijack()` 把响应生命周期交给 SDK。

2. **启用 JSON response 模式**：虽然底层仍是 Streamable HTTP transport，但生产实现默认启用 `enableJsonResponse: true`，这样自动化测试和脚本可以直接读取 JSON-RPC 响应体，同时仍保留 SDK 的 session 和协议校验逻辑。

3. **Zod 定义共享，由 SDK 生成工具 schema**：`src/shared/schemas.js` 继续使用 Zod 定义 `TAG_INPUT`、`STATUS_QUERY`，`tools.js` 直接把这些 Zod schema 注册到 SDK。JSON Schema 由 SDK 自动产出，避免手写转换逻辑。

4. **输入校验委托 taskManager**：MCP 工具不自行校验业务语义（如 tag 合法性），委托给 `taskManager` 层的 `normalizeTagName()`，与 REST API 共享同一校验逻辑。

5. **默认仍不开放 SSE 交互面**：当前工具均为同步 CRUD，无服务端推送需求。PoC 仍可切换 SSE 模式做验证，但生产默认返回 JSON 响应。
