const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');

test('startup runs one polling cycle immediately', async () => {
  let runAllCount = 0;

  const app = createApp({
    config: {
      tasksDir: '/virtual/tasks',
    },
    runner: {
      async runAll() {
        runAllCount += 1;
        return createSummary({ hasUnfinishedTasks: false });
      },
    },
    fsModule: createFsDouble(),
    pathModule,
    processModule: createProcessModule(),
    processId: 12345,
    isProcessAlive() {
      return false;
    },
    logger: createLogger(),
    setTimeout() {
      throw new Error('setTimeout should not be called in this test');
    },
    clearTimeout() {},
  });

  await app.start();

  assert.equal(runAllCount, 1);
});

test('when unfinished tasks remain, exactly one next timer is scheduled with the configured interval', async () => {
  let runAllCount = 0;
  const timers = createTimerDoubles();
  const logger = createLogger();
  const fsDouble = createFsDouble();

  const app = createApp({
    config: {
      pollIntervalMinutes: 5,
      tasksDir: '/virtual/tasks',
    },
    runner: {
      async runAll() {
        runAllCount += 1;
        return createSummary({ hasUnfinishedTasks: true, processingCount: 1 });
      },
    },
    fsModule: fsDouble,
    pathModule,
    processModule: createProcessModule(),
    processId: 12345,
    isProcessAlive() {
      return false;
    },
    logger,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  await app.start();

  assert.equal(runAllCount, 1);
  assert.equal(fsDouble.files['/virtual/tasks/watcher.pid'], '12345\n');
  assert.equal(timers.scheduled.length, 1);
  assert.equal(timers.scheduled[0].delay, 5 * 60 * 1000);
  assert.deepEqual(timers.cleared, []);
  assert.deepEqual(logger.infoMessages, [
    'Watcher started.',
    'Watcher rescheduled in 5 minute(s).',
  ]);

  await timers.scheduled[0].callback();

  assert.equal(runAllCount, 2);
  assert.deepEqual(timers.cleared, [timers.scheduled[0]]);
  assert.equal(timers.scheduled.length, 2);
  assert.equal(timers.scheduled[1].delay, 5 * 60 * 1000);
});

test('when no unfinished tasks remain, no timer is scheduled and startup exits cleanly', async () => {
  let runAllCount = 0;
  const timers = createTimerDoubles();
  const logger = createLogger();
  const fsDouble = createFsDouble();

  const app = createApp({
    config: {
      tasksDir: '/virtual/tasks',
    },
    runner: {
      async runAll() {
        runAllCount += 1;
        return createSummary({ hasUnfinishedTasks: false });
      },
    },
    fsModule: fsDouble,
    pathModule,
    processModule: createProcessModule(),
    processId: 12345,
    isProcessAlive() {
      return false;
    },
    logger,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  const result = await app.start();

  assert.equal(runAllCount, 1);
  assert.equal(result.result, null);
  assert.deepEqual(timers.scheduled, []);
  assert.deepEqual(fsDouble.unlinks, ['/virtual/tasks/watcher.pid']);
  assert.deepEqual(logger.infoMessages, [
    'Watcher started.',
    'Watcher idle. Exiting.',
  ]);
});

test('scheduled polling errors are logged and keep one next timer for unfinished tasks', async () => {
  let runAllCount = 0;
  const timers = createTimerDoubles();
  const logger = createLogger();

  const app = createApp({
    config: {
      pollIntervalMinutes: 5,
      tasksDir: '/virtual/tasks',
    },
    runner: {
      async runAll() {
        runAllCount += 1;

        if (runAllCount === 2) {
          throw new Error('boom');
        }

        return createSummary({ hasUnfinishedTasks: true, processingCount: 1 });
      },
    },
    fsModule: createFsDouble(),
    pathModule,
    processModule: createProcessModule(),
    processId: 12345,
    isProcessAlive() {
      return false;
    },
    logger,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  await app.start();
  await timers.scheduled[0].callback();

  assert.equal(runAllCount, 2);
  assert.equal(timers.scheduled.length, 2);
  assert.equal(logger.errorMessages.length, 1);
  assert.equal(logger.errorMessages[0][0], 'Watcher run failed.');
  assert.equal(logger.errorMessages[0][1].message, 'boom');
});

test('invalid poll interval propagates as startup failure', async () => {
  let runAllCount = 0;
  const timers = createTimerDoubles();
  const fsDouble = createFsDouble();

  const app = createApp({
    config: {
      pollIntervalMinutes: 0,
      tasksDir: '/virtual/tasks',
    },
    runner: {
      async runAll() {
        runAllCount += 1;
        return createSummary({ hasUnfinishedTasks: true, processingCount: 1 });
      },
    },
    fsModule: fsDouble,
    pathModule,
    processModule: createProcessModule(),
    processId: 12345,
    isProcessAlive() {
      return false;
    },
    logger: createLogger(),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  await assert.rejects(
    () => app.start(),
    /pollIntervalMinutes must be a positive number/,
  );
  assert.equal(runAllCount, 0);
  assert.deepEqual(timers.scheduled, []);
  assert.deepEqual(fsDouble.writes, []);
});

test('createApp returns already_running when watcher pid points to a live process', async () => {
  let runAllCount = 0;
  const logger = createLogger();

  const app = createApp({
    config: {
      tasksDir: '/virtual/tasks',
    },
    runner: {
      async runAll() {
        runAllCount += 1;
        return createSummary({ hasUnfinishedTasks: true, processingCount: 1 });
      },
    },
    fsModule: createFsDouble({
      files: {
        '/virtual/tasks/watcher.pid': '999\n',
      },
    }),
    pathModule,
    processModule: createProcessModule(),
    processId: 12345,
    isProcessAlive(pid) {
      return pid === 999;
    },
    logger,
    setTimeout() {
      throw new Error('setTimeout should not be called when watcher is already running');
    },
    clearTimeout() {},
  });

  const result = await app.start();

  assert.equal(result.result.status, 'already_running');
  assert.equal(typeof result.abort, 'function');
  assert.equal(runAllCount, 0);
  assert.deepEqual(logger.infoMessages, [
    'Watcher already running.',
  ]);
});

test('stale watcher pid file is replaced when the process is gone', async () => {
  const fsDouble = createFsDouble({
    files: {
      '/virtual/tasks/watcher.pid': '999\n',
    },
  });

  const app = createApp({
    config: {
      pollIntervalMinutes: 5,
      tasksDir: '/virtual/tasks',
    },
    runner: {
      async runAll() {
        return createSummary({ hasUnfinishedTasks: true, processingCount: 1 });
      },
    },
    fsModule: fsDouble,
    pathModule,
    processModule: createProcessModule(),
    processId: 12345,
    isProcessAlive() {
      return false;
    },
    logger: createLogger(),
    setTimeout: createTimerDoubles().setTimeout,
    clearTimeout() {},
  });

  await app.start();

  assert.equal(fsDouble.files['/virtual/tasks/watcher.pid'], '12345\n');
});

function createSummary({
  pendingCount = 0,
  processingCount = 0,
  hasUnfinishedTasks = pendingCount > 0 || processingCount > 0,
} = {}) {
  return {
    pendingCount,
    processingCount,
    hasUnfinishedTasks,
  };
}

function createTimerDoubles() {
  const scheduled = [];
  const cleared = [];
  let nextId = 0;

  return {
    scheduled,
    cleared,
    setTimeout(callback, delay) {
      const handle = {
        id: nextId += 1,
        callback,
        delay,
      };

      scheduled.push(handle);

      return handle;
    },
    clearTimeout(handle) {
      cleared.push(handle);
    },
  };
}

function createFsDouble({ files = {} } = {}) {
  const state = { ...files };
  const writes = [];
  const unlinks = [];

  return {
    files: state,
    writes,
    unlinks,
    async mkdir() {},
    async readFile(filePath) {
      if (!(filePath in state)) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }

      return state[filePath];
    },
    async writeFile(filePath, content) {
      state[filePath] = content;
      writes.push({ filePath, content });
    },
    async unlink(filePath) {
      if (!(filePath in state)) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }

      delete state[filePath];
      unlinks.push(filePath);
    },
  };
}

function createLogger() {
  const infoMessages = [];
  const errorMessages = [];

  return {
    infoMessages,
    errorMessages,
    info(message) {
      infoMessages.push(message);
    },
    error(message, error) {
      errorMessages.push([message, error]);
    },
  };
}

function createProcessModule() {
  return {
    on() {},
    removeListener() {},
  };
}

const pathModule = {
  join(...parts) {
    return parts.join('/');
  },
};
