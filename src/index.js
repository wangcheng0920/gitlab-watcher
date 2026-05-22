const cron = require('node-cron');

const { resolveCronExpression } = require('./expression');
const { createRequestRunner } = require('./request');
const { createNotifier } = require('./notify');
const { createTaskRunner } = require('./task-runner');

function createApp({
  cron: cronModule = cron,
  config = {},
  request,
  notify,
  runner,
  logger = console,
} = {}) {
  const cronExpression = resolveCronExpression(config);
  const runRequest = request || createRequestRunner({
    baseUrl: config.baseUrl,
    projectId: config.projectId,
  });
  const sendNotification = notify || createNotifier();
  const taskRunner = runner || createTaskRunner({
    tasksDir: config.tasksDir,
    request: runRequest,
    notify: sendNotification,
    logger,
  });

  return {
    async start() {
      logger.info(`Starting watcher with cron expression: ${cronExpression}`);
      await taskRunner.runAll();

      return cronModule.schedule(cronExpression, async () => {
        try {
          await taskRunner.runAll();
        } catch (error) {
          logger.error('Watcher run failed.', error);
        }
      });
    },
  };
}

if (require.main === module) {
  createApp().start();
}

module.exports = {
  createApp,
};
