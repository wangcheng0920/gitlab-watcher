const fs = require('node:fs/promises');
const path = require('node:path');

require('dotenv').config({ quiet: true });

const { createApp } = require('./app');
const { createTaskManager } = require('./task/manager');
const { createApiServer } = require('./server');
const { createMcpHandler } = require('./mcp');
const { isProcessAlive, readExistingPid } = require('./shared/process');
const { createFeishuNotifier } = require('./notify');

const DEFAULT_PORT = 3099;

async function startDaemon({
  config = {},
  logger = console,
  fsModule = fs,
  pathModule = path,
  processModule = process,
  processId = process.pid,
  setTimeout: setTimeoutFn = global.setTimeout,
  clearTimeout: clearTimeoutFn = global.clearTimeout,
} = {}) {
  const port = config.port || processModule.env.PORT || DEFAULT_PORT;
  const tasksDir = config.tasksDir || pathModule.join(processModule.cwd(), 'tasks');
  const pidFile = pathModule.join(tasksDir, 'watcher.pid');

  await fsModule.mkdir(tasksDir, { recursive: true });

  const existingPid = await readExistingPid(pidFile, fsModule);

  if (existingPid && isProcessAlive(Number(existingPid))) {
    throw new Error('Watcher already running.');
  }

  await fsModule.writeFile(pidFile, `${processId}\n`, 'utf8');

  const taskManager = createTaskManager({ tasksDir, fsModule, pathModule });
  const mcpHandler = createMcpHandler({ taskManager });
  const server = createApiServer({ taskManager, mcpHandler, logger: false });

  let watcherAbort = null;

  const cleanup = createGracefulShutdown({
    server,
    pidFile,
    fsModule,
    logger,
    processModule,
    getWatcherAbort: () => watcherAbort,
  });

  processModule.on('SIGINT', cleanup);
  processModule.on('SIGTERM', cleanup);

  await server.listen({ port, host: '127.0.0.1' });
  logger.info(`API server listening on http://127.0.0.1:${port}`);

  let notify;

  if (processModule.env.FEISHU_WEBHOOK_URL) {
    notify = createFeishuNotifier({
      webhookUrl: processModule.env.FEISHU_WEBHOOK_URL,
      secret: processModule.env.FEISHU_WEBHOOK_SECRET,
    });
    logger.info('Using Feishu webhook for notifications.');
  }

  const app = createApp({
    config,
    watch: true,
    managePid: false,
    manageSignals: false,
    logger,
    notify,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
  });

  const { abort } = await app.start();
  watcherAbort = abort;
}

function createGracefulShutdown({
  server,
  pidFile,
  fsModule,
  logger,
  processModule,
  getWatcherAbort,
}) {
  let shuttingDown = false;

  return async function gracefulShutdown() {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('Shutting down...');

    const watcherAbort = getWatcherAbort();

    if (watcherAbort) {
      await watcherAbort();
    }

    try {
      await server.close();
    } catch (error) {
      if (error.message !== 'Server is not running.') {
        logger.error('Server shutdown failed.', error);
      }
    }

    try {
      await fsModule.unlink(pidFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('PID file cleanup failed.', error);
      }
    }

    logger.info('Shutdown complete.');
    processModule.exit(0);
  };
}

module.exports = {
  startDaemon,
};
