const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { startDaemon } = require('../src/daemon');

function createTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-watcher-daemon-'));
}

function createTimerDoubles() {
  const scheduled = [];
  const cleared = [];

  return {
    scheduled,
    cleared,
    setTimeout(fn, delay) {
      const id = scheduled.length + 1;
      scheduled.push({ id, fn, delay });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
    },
  };
}

test('startDaemon throws when watcher pid points to a live process', async () => {
  const tmp = createTempDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  fs.mkdirSync(path.join(tasksDir, 'pending'), { recursive: true });
  fs.mkdirSync(path.join(tasksDir, 'processing'), { recursive: true });
  fs.mkdirSync(path.join(tasksDir, 'archive', 'success'), { recursive: true });
  fs.mkdirSync(path.join(tasksDir, 'archive', 'failed'), { recursive: true });
  fs.mkdirSync(path.join(tasksDir, 'archive', 'canceled'), { recursive: true });
  fs.writeFileSync(path.join(tasksDir, 'watcher.pid'), `${process.pid}\n`);

  try {
    await assert.rejects(
      () => startDaemon({
        config: { port: 0, tasksDir },
        fsModule: require('node:fs/promises'),
        pathModule: path,
        processModule: { on() {}, env: process.env, cwd: () => tmp },
        processId: 99999,
        logger: { info() {}, error() {} },
      }),
      /Watcher already running/,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('startDaemon writes PID file and starts server on 127.0.0.1', async () => {
  const tmp = createTempDirectory();
  const tasksDir = path.join(tmp, 'tasks');
  const timers = createTimerDoubles();

  try {
    const exitCodes = [];
    const infoLogs = [];
    const signals = {};

    const processModule = {
      on(signal, handler) { signals[signal] = handler; },
      env: process.env,
      cwd: () => tmp,
      exit(code) { exitCodes.push(code); },
    };

    const fsModule = require('node:fs/promises');

    await startDaemon({
      config: { port: 0, tasksDir, pollIntervalMinutes: 3 },
      fsModule,
      pathModule: path,
      processModule,
      processId: 12345,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      logger: {
        info(message) { infoLogs.push(message); },
        error() {},
      },
    });

    const pidContent = fs.readFileSync(path.join(tasksDir, 'watcher.pid'), 'utf8').trim();
    assert.equal(pidContent, '12345');
    assert.ok(infoLogs.some((m) => m.includes('API server listening')));
    assert.ok(infoLogs.some((m) => m.includes('Watcher started')));

    await signals.SIGINT();

    assert.ok(timers.cleared.length >= 1);
    assert.equal(exitCodes[0], 0);
    assert.ok(infoLogs.some((m) => m.includes('Shutdown complete')));
    assert.ok(!fs.existsSync(path.join(tasksDir, 'watcher.pid')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('startDaemon resolves server host to 127.0.0.1', async () => {
  const tmp = createTempDirectory();
  const tasksDir = path.join(tmp, 'tasks');
  const timers = createTimerDoubles();

  try {
    const infoLogs = [];
    const signals = {};

    const processModule = {
      on(signal, handler) { signals[signal] = handler; },
      env: process.env,
      cwd: () => tmp,
      exit() {},
    };

    await startDaemon({
      config: { port: 0, tasksDir, pollIntervalMinutes: 3 },
      fsModule: require('node:fs/promises'),
      pathModule: path,
      processModule,
      processId: 12345,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      logger: {
        info(message) { infoLogs.push(message); },
        error() {},
      },
    });

    const listenMsg = infoLogs.find((m) => m.includes('API server listening'));
    assert.ok(listenMsg);
    assert.ok(listenMsg.includes('127.0.0.1'));

    await signals.SIGINT();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
