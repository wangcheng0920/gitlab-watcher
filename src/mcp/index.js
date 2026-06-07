const { createToolDefinitions } = require('./tools');

const SERVER_INFO = {
  name: 'gitlab-watcher',
  version: '1.0.0',
};

function createMcpHandler({ taskManager }) {
  const toolDefs = createToolDefinitions({ taskManager });

  const tools = toolDefs.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  const toolsByName = new Map(toolDefs.map((t) => [t.name, t]));

  let initialized = false;

  return async function mcpHandler(request, reply) {
    const body = request.body;

    if (!body || typeof body !== 'object') {
      return reply.status(400).send(jsonRpcError(null, -32700, 'Parse error'));
    }

    const { jsonrpc, id, method, params } = body;

    if (jsonrpc !== '2.0') {
      return reply.status(400).send(jsonRpcError(id, -32600, 'Invalid Request'));
    }

    if (method === 'initialize') {
      if (initialized) {
        return reply.send(jsonRpcError(id, -32600, 'Server already initialized'));
      }

      initialized = true;

      return reply.send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: body.params?.protocolVersion || '2025-11-25',
          capabilities: {
            tools: {},
          },
          serverInfo: SERVER_INFO,
        },
      });
    }

    if (method === 'notifications/initialized') {
      return reply.send('');
    }

    if (!initialized) {
      return reply.send(jsonRpcError(id, -32000, 'Server not initialized'));
    }

    if (method === 'tools/list') {
      return reply.send({
        jsonrpc: '2.0',
        id,
        result: { tools },
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;

      if (!toolName) {
        return reply.send(jsonRpcError(id, -32602, 'Missing tool name'));
      }

      const tool = toolsByName.get(toolName);

      if (!tool) {
        return reply.send(jsonRpcError(id, -32601, `Tool not found: ${toolName}`));
      }

      try {
        const result = await tool.handler(params?.arguments || {});
        return reply.send({
          jsonrpc: '2.0',
          id,
          result,
        });
      } catch (error) {
        return reply.send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          },
        });
      }
    }

    if (method === 'ping') {
      return reply.send({ jsonrpc: '2.0', id, result: {} });
    }

    return reply.send(jsonRpcError(id, -32601, `Method not found: ${method}`));
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

module.exports = {
  createMcpHandler,
};
