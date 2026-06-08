const { randomUUID } = require('node:crypto');

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const { createToolDefinitions } = require('./tools');

const SERVER_INFO = {
  name: 'gitlab-watcher',
  version: '1.0.0',
};

function createMcpHandler({ taskManager }) {
  // SDK transport 会把协议状态保存在“会话”里。
  // 因此 /mcp 不能再按无状态 HTTP handler 来写：
  // initialize 之后的后续请求，必须回到同一个 transport 实例，
  // 让 SDK 继续校验 session id、protocol version 和生命周期状态。
  const sessions = new Map();

  async function mcpHandler(request, reply) {
    const body = request.body;

    if (!body || typeof body !== 'object') {
      return reply.status(400).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
    }

    const isInitialize = body.method === 'initialize';
    const sessionId = request.headers['mcp-session-id'];

    let session;

    if (isInitialize) {
      // initialize 是唯一允许“创建新 session”的请求。
      // 这里分两种情况：
      // 1. 没有 session header：说明是新客户端，创建新的 SDK session。
      // 2. 已经带了 session header：不要偷偷新建 session，而是回到旧 session，
      //    让 SDK 自己判断这是不是非法重复初始化，并返回标准协议错误。
      if (sessionId) {
        session = sessions.get(sessionId);

        if (!session) {
          // 客户端声称要复用一个服务端并不认识的 session。
          // 这里直接在本地返回错误，因为根本没有可交给 SDK 的 transport 实例。
          return reply.status(404).send({
            jsonrpc: '2.0',
            id: body.id ?? null,
            error: {
              code: -32000,
              message: `Session not found: ${sessionId}`,
            },
          });
        }
      } else {
        // 新会话初始化：为当前客户端创建一套全新的 server + transport。
        session = await createSession({ taskManager });
      }
    } else {
      // 非 initialize 请求都必须属于一个已知 session。
      // 这比之前的手写 JSON-RPC handler 更严格，因为 SDK transport 明确要求
      // 先完成 initialize，再在后续请求里保持 session 连续性。
      session = sessionId ? sessions.get(sessionId) : null;

      if (!session) {
        // 没有 session header，说明客户端跳过了 transport 生命周期。
        // 有 header 但找不到 session，说明客户端拿的是过期或非法 session。
        return reply.status(sessionId ? 404 : 400).send({
          jsonrpc: '2.0',
          id: body.id ?? null,
          error: {
            code: -32000,
            message: sessionId
              ? `Session not found: ${sessionId}`
              : 'Missing mcp-session-id header',
          },
        });
      }
    }

    // 从这里开始，响应写出就交给 SDK transport 直接操作原始 Node response。
    // Fastify 必须退出自己的 reply 生命周期，否则两边都会尝试写同一个响应，
    // 结果通常就是空 body、重复写出或不可预期的响应状态。
    if (typeof reply.hijack === 'function') {
      reply.hijack();
    }

    try {
      // 真实的 MCP 协议处理完全交给 SDK transport：
      // initialize、notifications/initialized、tools/list、tools/call、
      // 参数校验和响应序列化都由 SDK 负责。
      await session.transport.handleRequest(request.raw, reply.raw, body);

      if (isInitialize && session.transport.sessionId) {
        // session id 是 transport 在 initialize 阶段生成的。
        // 只有当 initialize 真正成功后，才把 session 放进 Map，避免把半初始化状态
        // 暴露给后续请求。
        sessions.set(session.transport.sessionId, session);
      }
    } catch (error) {
      if (isInitialize) {
        // initialize 半途中失败时，要把临时创建的 server/transport 立刻清掉，
        // 否则会留下一个从未完成握手、也永远不可用的 session 对象。
        await closeSession(session);
      }

      throw error;
    }
  }

  mcpHandler.close = async () => {
    // 服务关闭时，不只是 HTTP server 要停，所有 MCP session 也要一起关掉。
    // 这样测试更稳定，也避免 Fastify 退出后 transport 还留在内存里。
    await Promise.all(Array.from(sessions.values(), closeSession));
    sessions.clear();
  };

  return mcpHandler;
}

async function createSession({ taskManager }) {
  // 底层仍然是 SDK 的 Streamable HTTP transport，
  // 但这里打开 JSON response mode，让测试和脚本可以直接消费 JSON body，
  // 不必再去解析 SSE frame。
  // 即便如此，session 管理、协议协商和 tool dispatch 仍然完全由 SDK 负责。
  const server = new McpServer(SERVER_INFO);
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: () => randomUUID(),
  });

  // tool 的定义集中放在 tools.js。
  // 这里的职责只是把这些定义注册给 SDK：
  // SDK 负责把 Zod schema 转成 MCP 可暴露的 tool schema，并在调用时执行 handler。
  for (const toolDef of createToolDefinitions({ taskManager })) {
    server.registerTool(toolDef.name, {
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
    }, toolDef.handler);
  }

  // connect() 之后，这个 transport 才真正具备处理 handleRequest() 的能力。
  await server.connect(transport);

  return { server, transport };
}

async function closeSession(session) {
  if (!session) {
    return;
  }

  // server 和 transport 两层都做兜底关闭。
  // 任何一层即便已经半关闭，也不应该阻止另一层继续清理。
  await Promise.allSettled([
    session.server.close(),
    session.transport.close(),
  ]);
}

module.exports = {
  createMcpHandler,
};
