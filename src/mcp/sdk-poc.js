const Fastify = require('fastify');
const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

async function createSdkPocServer({
  logger = true,
  hijackReply = true,
  transportMode = 'stateful',
  enableJsonResponse = true,
} = {}) {
  const app = Fastify({ logger });
  const server = new McpServer({
    name: 'gitlab-watcher-sdk-poc',
    version: '1.0.0',
  });
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse,
    sessionIdGenerator: transportMode === 'stateful' ? () => randomUUID() : undefined,
  });

  server.registerTool(
    'echo',
    {
      description: 'Echo a message back to the caller.',
      inputSchema: z.object({
        message: z.string().describe('The message to echo back.'),
      }),
    },
    async ({ message }) => ({
      content: [{ type: 'text', text: `echo:${message}` }],
    }),
  );

  await server.connect(transport);

  app.post('/mcp', async (request, reply) => {
    if (hijackReply && typeof reply.hijack === 'function') {
      reply.hijack();
    }

    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  app.addHook('onClose', async () => {
    await server.close();
  });

  return app;
}

module.exports = {
  createSdkPocServer,
};