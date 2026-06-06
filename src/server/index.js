const Fastify = require('fastify');

const tasksRoutes = require('./routes/tasks');
const taskRoutes = require('./routes/task');
const healthRoutes = require('./routes/health');

function createApiServer({
  taskManager,
  logger = true,
} = {}) {
  const app = Fastify({ logger });

  app.decorate('taskManager', taskManager);

  app.register(tasksRoutes, { prefix: '/tasks' });
  app.register(taskRoutes, { prefix: '/task' });
  app.register(healthRoutes, { prefix: '/health' });

  return app;
}

module.exports = {
  createApiServer,
};
