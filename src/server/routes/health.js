async function healthRoutes(fastify) {
  fastify.get('/', async () => {
    const [pendingTasks, processingTasks] = await Promise.all([
      fastify.taskManager.listTasks({ status: 'pending' }),
      fastify.taskManager.listTasks({ status: 'processing' }),
    ]);

    return {
      status: 'ok',
      pendingCount: pendingTasks.length,
      processingCount: processingTasks.length,
    };
  });
}

module.exports = healthRoutes;
