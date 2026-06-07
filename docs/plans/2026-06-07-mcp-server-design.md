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

采用 **Streamable HTTP** 传输方式，仅支持 POST 请求的 JSON-RPC 2.0 协议。不使用 SSE 流（无服务端推送需求），不使用 Session 管理（无状态）。

## MCP Tools

5 个工具与 REST API 接口一一对应：

| Tool | 对应 REST | 参数 | 说明 |
|------|----------|------|------|
| `create_task` | `POST /tasks` | `tag` (string, required) | 创建监听任务 |
| `list_tasks` | `GET /tasks` | `status` (string, optional: pending/processing/archive) | 列出任务 |
| `get_task` | `GET /task` | `tag` (string, required) | 查看任务详情 |
| `delete_task` | `DELETE /task` | `tag` (string, required) | 删除任务 |
| `clear_tasks` | `DELETE /tasks` | 无 | 清理未完结任务 |

每个工具的 `inputSchema` 为 JSON Schema 格式，供 MCP 客户端用于参数提示和校验。

## JSON-RPC 流程

```
Client                          Server
  │                                │
  ├─ POST /mcp                     │
  │   initialize                   │
  │                                ├─ 200 { result: { capabilities, serverInfo } }
  │                                │
  ├─ POST /mcp                     │
  │   notifications/initialized    │
  │                                ├─ 200 (空)
  │                                │
  ├─ POST /mcp                     │
  │   tools/list                   │
  │                                ├─ 200 { result: { tools: [...] } }
  │                                │
  ├─ POST /mcp                     │
  │   tools/call                   │
  │   { name, arguments }          │
  │                                ├─ 200 { result: { content: [...] } }
  │                                │
```

服务端维护一个 `initialized` 标志位，`tools/list` 和 `tools/call` 必须在 `initialize` 之后才能调用，否则返回 `-32000 Server not initialized` 错误。

## 模块实现

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/mcp/index.js` | `createMcpHandler` 工厂函数。创建 Fastify 路由处理器，内部实现 JSON-RPC 2.0 协议解析、方法路由、工具调度 |
| `src/mcp/tools.js` | `createToolDefinitions` 工厂函数。定义 5 个工具的 name / description / inputSchema / handler，handler 委托 `taskManager` 完成实际操作 |
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
| 非 JSON-RPC 2.0 | `-32600` | Invalid Request |
| 未 initialize 就调 tools | `-32000` | Server not initialized |
| 工具不存在 | `-32601` | Method not found |
| 参数缺失 | `-32602` | Invalid params |
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

1. **不使用 `McpServer` / `StreamableHTTPServerTransport`**：SDK 的 Streamable HTTP Transport 在 Fastify 下集成时，除首请求外后续请求均返回空响应（`handleRequest` 未报错但无输出）。因排查未定位到确切根因，改为直接在 Fastify handler 中实现 JSON-RPC 2.0 协议，代码更可控。

2. **Zod 定义共享，自转换 JSON Schema**：`src/shared/schemas.js` 使用 Zod 定义一份共享 schema（`TAG_INPUT`、`STATUS_QUERY`）。`tools.js` 通过 `zodToJsonSchema()` 将 Zod schema 转换为 JSON Schema 供 MCP `inputSchema` 使用。Zod 作为唯一定义源，避免 JSON Schema 与校验逻辑分散维护。

3. **输入校验委托 taskManager**：MCP 工具不自行校验参数（如 tag 非空），委托给 `taskManager` 层的 `normalizeTagName()`，与 REST API 共享同一校验逻辑。

4. **不支持 SSE 流**：当前工具均为同步 CRUD，无服务端推送需求。未来如需支持 server push，可按需扩展。
