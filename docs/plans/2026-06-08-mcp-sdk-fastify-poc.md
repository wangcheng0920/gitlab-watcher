# MCP SDK Fastify PoC

## 目标

补一套最小 PoC，用来验证 `@modelcontextprotocol/sdk` 在 Fastify 下的正确接法，并快速复现常见误用场景；当前这套 PoC 已作为生产 `/mcp` 重构的验证依据。

## 当前实现

新增以下辅助文件：

1. `src/mcp/sdk-poc.js`
2. `test/mcp-sdk-poc.test.js`
3. `test/manual-mcp-sdk.js`

其中：

1. `sdk-poc.js` 提供隔离的 Fastify + `McpServer` + `StreamableHTTPServerTransport` 接入
2. 自动化测试覆盖 `initialize -> notifications/initialized -> tools/list -> tools/call`
3. 手动脚本用于打印每一步的状态码、响应头和原始响应体，便于定位空响应、SSE 响应、会话头缺失等问题

## 关键发现

1. SDK 的 `StreamableHTTPServerTransport` 在 `sessionIdGenerator: undefined` 的无状态模式下不能跨请求复用；源码会直接抛出 `Stateless transport cannot be reused across requests`
2. POST 请求必须同时声明 `Accept: application/json, text/event-stream`
3. 初始化成功后，后续请求必须携带 `mcp-session-id` 与 `mcp-protocol-version`
4. 若需要在本地测试里直接断言 JSON-RPC body，可启用 `enableJsonResponse: true`
5. 在 Fastify 路由中应继续使用 `reply.hijack()`，把响应生命周期交给 SDK transport

## 使用方式

自动化校验：

```bash
pnpm test:mcp-sdk
```

手动诊断：

```bash
pnpm test:mcp-sdk:manual
pnpm test:mcp-sdk:manual -- --stateless
pnpm test:mcp-sdk:manual -- --no-hijack
pnpm test:mcp-sdk:manual -- --sse
```

## 结论

基于这次 PoC，`Fastify + SDK` 的最小链路可以稳定跑通；之前的问题主要来自 transport 生命周期、请求头和响应模式使用不当，而不是 SDK 与 Fastify 天生不兼容。当前生产 `/mcp` 已按这套结论重构为 SDK 实现。