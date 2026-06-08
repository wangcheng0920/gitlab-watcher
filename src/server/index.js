const Fastify = require('fastify');

const tasksRoutes = require('./routes/tasks');
const taskRoutes = require('./routes/task');
const healthRoutes = require('./routes/health');

function createApiServer({
  taskManager,
  mcpHandler,
  logger = true,
} = {}) {
  const app = Fastify({ logger });

  // 路由层统一通过 Fastify decoration 取 taskManager，
  // 这样 REST handler 不需要自己再处理依赖注入。
  app.decorate('taskManager', taskManager);

  app.register(tasksRoutes, { prefix: '/tasks' });
  app.register(taskRoutes, { prefix: '/task' });
  app.register(healthRoutes, { prefix: '/health' });

  if (mcpHandler) {
    // MCP 端点和 REST 端点共享同一个 Fastify 实例，
    // 但协议处理完全交给 mcpHandler。
    app.post('/mcp', mcpHandler);

    if (typeof mcpHandler.close === 'function') {
      // 关闭 Fastify 时，顺带关闭 handler 内部维护的 MCP session/transport 资源。
      app.addHook('onClose', async () => {
        await mcpHandler.close();
      });
    }
  }

  return app;
}

module.exports = {
  createApiServer,
};
