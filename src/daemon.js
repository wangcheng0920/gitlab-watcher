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

  // serve 模式和 CLI watcher 共享同一个 pid 文件，避免同一份 tasks 目录上出现两个实例并发处理。
  const existingPid = await readExistingPid(pidFile, fsModule);

  if (existingPid && isProcessAlive(Number(existingPid))) {
    throw new Error('Watcher already running.');
  }

  await fsModule.writeFile(pidFile, `${processId}\n`, 'utf8');

  // taskManager 是 REST 和 MCP 的共同业务入口。
  // daemon 在这里把“任务管理能力”与“协议暴露方式”拼装到同一个服务进程里。
  const taskManager = createTaskManager({ tasksDir, fsModule, pathModule });
  const mcpHandler = createMcpHandler({ taskManager });
  const server = createApiServer({ taskManager, mcpHandler, logger: false });

  let watcherAbort = null;

  // 守护进程需要同时关闭三层资源：
  // 1. 后台 watcher 轮询
  // 2. Fastify HTTP 服务
  // 3. 当前实例的 pid 文件
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

  await server.listen({ port, host: '0.0.0.0' });
  logger.info(`API server listening on http://0.0.0.0:${port}`);

  let notify;

  if (processModule.env.FEISHU_WEBHOOK_URL) {
    const atUsers = processModule.env.FEISHU_AT_USERS
      ? processModule.env.FEISHU_AT_USERS.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    // serve 模式在有 webhook 配置时切换到飞书通知；
    // 没配置时仍沿用默认本地通知实现。
    notify = createFeishuNotifier({
      webhookUrl: processModule.env.FEISHU_WEBHOOK_URL,
      secret: processModule.env.FEISHU_WEBHOOK_SECRET,
      atUsers,
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

  // createApp 负责后台轮询本身；daemon 只负责把 abort 句柄保存下来，供关闭流程复用。
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
      // 先停后台轮询，避免关闭 HTTP 服务期间仍有任务处理在写文件或发通知。
      await watcherAbort();
    }

    try {
      // server.close() 会顺带触发 Fastify onClose 钩子，
      // 从而进一步关闭 MCP 会话与 transport。
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
