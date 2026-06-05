async function tasksRoutes(fastify) {
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['tag'],
        properties: {
          tag: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { tag } = request.body;

    try {
      const filePath = await fastify.taskManager.createTask({ tagName: tag });
      reply.code(201);
      return { tag, filePath };
    } catch (error) {
      if (error.message.startsWith('Task already exists')) {
        reply.code(409);
        return { error: error.message };
      }

      reply.code(400);
      return { error: error.message };
    }
  });

  fastify.get('/', async (request) => {
    const { status } = request.query;
    const tasks = await fastify.taskManager.listTasks({ status });
    return { tasks };
  });

  fastify.delete('/', async () => {
    const deletedCount = await fastify.taskManager.clearUnfinishedTasks();
    return { deletedCount };
  });
}

module.exports = tasksRoutes;
