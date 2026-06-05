const fs = require('node:fs/promises');
const path = require('node:path');

require('dotenv').config({ quiet: true });

const { createApp } = require('./index');
const { createTaskManager } = require('./task-manager');
const { createApiServer } = require('./api-server');

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
  const server = createApiServer({ taskManager, logger: false });

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

  const app = createApp({
    config,
    watch: true,
    managePid: false,
    manageSignals: false,
    logger,
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

async function readExistingPid(pidFile, fsModule) {
  try {
    const content = await fsModule.readFile(pidFile, 'utf8');
    return content.trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'EPERM') {
      return true;
    }

    if (error.code === 'ESRCH') {
      return false;
    }

    throw error;
  }
}

if (require.main === module) {
  startDaemon().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  startDaemon,
};
