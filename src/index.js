const fs = require('node:fs/promises');
const path = require('node:path');

const { resolvePollIntervalMinutes } = require('./expression');
const { createRequestRunner } = require('./request');
const { createNotifier } = require('./notify');
const { createTaskRunner } = require('./task-runner');

const WATCHER_PID_FILE_NAME = 'watcher.pid';
const WATCHER_SIGNALS = ['SIGINT', 'SIGTERM'];

function createApp({
  config = {},
  request,
  notify,
  runner,
  logger = console,
  setTimeout: setTimeoutFn = global.setTimeout,
  clearTimeout: clearTimeoutFn = global.clearTimeout,
  fsModule = fs,
  pathModule = path,
  processModule = process,
  processId = process.pid,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  const tasksDir = config.tasksDir || pathModule.join(process.cwd(), 'tasks');
  const watcherPidPath = pathModule.join(tasksDir, WATCHER_PID_FILE_NAME);
  const runRequest = request || createRequestRunner({
    baseUrl: config.baseUrl,
    projectId: config.projectId,
  });
  const sendNotification = notify || createNotifier();
  const taskRunner = runner || createTaskRunner({
    tasksDir,
    request: runRequest,
    notify: sendNotification,
    logger,
  });
  let timeoutHandle = null;
  let shutdownPromise = null;
  let signalHandler;

  return {
    async start() {
      const pollIntervalMinutes = resolvePollIntervalMinutes(config);
      const pollIntervalMilliseconds = pollIntervalMinutes * 60 * 1000;

      if (!await acquireWatcherPid()) {
        logger.info('Watcher already running.');
        return { status: 'already_running' };
      }

      registerSignalHandler();
      logger.info('Watcher started.');

      try {
        return await runCycle();
      } catch (error) {
        await shutdown();
        throw error;
      }

      async function runCycle() {
        const summary = await taskRunner.runAll();

        if (!summary?.hasUnfinishedTasks) {
          await shutdown();
          logger.info('Watcher idle. Exiting.');
          return null;
        }

        return scheduleNextCycle();
      }

      function scheduleNextCycle() {
        if (timeoutHandle) {
          clearTimeoutFn(timeoutHandle);
        }

        timeoutHandle = setTimeoutFn(async () => {
          try {
            await runCycle();
          } catch (error) {
            logger.error('Watcher run failed.', error);
            scheduleNextCycle();
          }
        }, pollIntervalMilliseconds);

        logger.info(`Watcher rescheduled in ${pollIntervalMinutes} minute(s).`);

        return timeoutHandle;
      }

      async function acquireWatcherPid() {
        await fsModule.mkdir(tasksDir, { recursive: true });

        try {
          const existingPid = String(await fsModule.readFile(watcherPidPath, 'utf8')).trim();

          if (existingPid && isProcessAlive(Number(existingPid))) {
            return false;
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }

        await fsModule.writeFile(watcherPidPath, `${processId}\n`, 'utf8');
        return true;
      }

      function registerSignalHandler() {
        if (typeof processModule.on !== 'function') {
          return;
        }

        signalHandler = async () => {
          try {
            await shutdown();
            processModule.exit?.(0);
          } catch (error) {
            logger.error('Watcher shutdown failed.', error);
            processModule.exit?.(1);
          }
        };

        for (const signal of WATCHER_SIGNALS) {
          processModule.on(signal, signalHandler);
        }
      }

      async function shutdown() {
        if (shutdownPromise) {
          return shutdownPromise;
        }

        shutdownPromise = (async () => {
          if (timeoutHandle) {
            clearTimeoutFn(timeoutHandle);
            timeoutHandle = null;
          }

          unregisterSignalHandler();

          try {
            await fsModule.unlink(watcherPidPath);
          } catch (error) {
            if (error.code !== 'ENOENT') {
              throw error;
            }
          }
        })();

        return shutdownPromise;
      }

      function unregisterSignalHandler() {
        if (!signalHandler || typeof processModule.removeListener !== 'function') {
          return;
        }

        for (const signal of WATCHER_SIGNALS) {
          processModule.removeListener(signal, signalHandler);
        }

        signalHandler = undefined;
      }
    },
  };
}

function defaultIsProcessAlive(pid) {
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
  createApp().start();
}

module.exports = {
  createApp,
};
