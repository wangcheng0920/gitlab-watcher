async function taskRoutes(fastify) {
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['tag'],
        properties: {
          tag: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { tag } = request.query;
    const task = await fastify.taskManager.getTask({ tagName: tag });

    if (!task) {
      reply.code(404);
      return { error: `Task not found for tag "${tag}".` };
    }

    return task;
  });

  fastify.delete('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['tag'],
        properties: {
          tag: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { tag } = request.query;
    const deleted = await fastify.taskManager.deleteTask({ tagName: tag });

    if (!deleted) {
      reply.code(404);
      return { error: `Task not found for tag "${tag}".` };
    }

    return { tag, deleted: true };
  });
}

module.exports = taskRoutes;
