const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTaskRunner } = require('../src/task-runner');

function createTasksDirectory() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-watcher-'));
  const tasksDirectory = path.join(tempDirectory, 'tasks');

  fs.mkdirSync(path.join(tasksDirectory, 'pending'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'processing'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'archive', 'success'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'archive', 'failed'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'archive', 'canceled'), { recursive: true });

  return tempDirectory;
}

test('createTaskRunner moves pending tasks into processing and prepends the latest running result', async () => {
  const tempDirectory = createTasksDirectory();
  const tasksDirectory = path.join(tempDirectory, 'tasks');
  const pendingFile = path.join(tasksDirectory, 'pending', 'release-1.2.3.md');
  const infoLogs = [];

  fs.writeFileSync(pendingFile, '');

  const runner = createTaskRunner({
    tasksDir: tasksDirectory,
    request: async ({ tagName }) => {
      assert.equal(tagName, 'release-1.2.3');

      return {
        status: 'running',
        pipelineId: '102938',
      };
    },
    notify() {
      throw new Error('notify should not be called for running tasks');
    },
    now() {
      return '2026-05-21T14:25:00.000Z';
    },
    logger: {
      info(message) {
        infoLogs.push(message);
      },
      error() {},
    },
  });

  try {
    await runner.runAll();

    assert.equal(fs.existsSync(pendingFile), false);
    assert.equal(fs.existsSync(path.join(tasksDirectory, 'processing', 'release-1.2.3.md')), true);
    assert.equal(
      fs.readFileSync(path.join(tasksDirectory, 'processing', 'release-1.2.3.md'), 'utf8'),
      '---\nqueryTime: 2026-05-21T14:25:00.000Z\nstatus: running\npipelineId: 102938\n',
    );
    assert.deepEqual(infoLogs, [
      'Query result: tag=release-1.2.3 status=running',
    ]);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('createTaskRunner appends query_error and keeps the task in processing when the request fails', async () => {
  const tempDirectory = createTasksDirectory();
  const tasksDirectory = path.join(tempDirectory, 'tasks');
  const processingFile = path.join(tasksDirectory, 'processing', 'release-1.2.3.md');
  const infoLogs = [];

  fs.writeFileSync(processingFile, '---\nqueryTime: 2026-05-21T14:20:00.000Z\nstatus: running\npipelineId: 102938\n');

  const runner = createTaskRunner({
    tasksDir: tasksDirectory,
    request: async () => {
      throw new Error('network failed');
    },
    notify() {
      throw new Error('notify should not be called for query errors');
    },
    now() {
      return '2026-05-21T14:25:00.000Z';
    },
    logger: {
      info(message) {
        infoLogs.push(message);
      },
      error() {},
    },
  });

  try {
    await runner.runAll();

    assert.equal(fs.existsSync(processingFile), true);
    assert.equal(
      fs.readFileSync(processingFile, 'utf8'),
      '---\nqueryTime: 2026-05-21T14:25:00.000Z\nstatus: query_error\n\n---\nqueryTime: 2026-05-21T14:20:00.000Z\nstatus: running\npipelineId: 102938\n',
    );
    assert.deepEqual(infoLogs, [
      'Query result: tag=release-1.2.3 status=query_error',
    ]);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('createTaskRunner notifies and archives successful tasks after prepending the terminal result', async () => {
  const tempDirectory = createTasksDirectory();
  const tasksDirectory = path.join(tempDirectory, 'tasks');
  const processingFile = path.join(tasksDirectory, 'processing', 'release-1.2.3.md');
  const notifications = [];

  fs.writeFileSync(processingFile, '---\nqueryTime: 2026-05-21T14:20:00.000Z\nstatus: running\npipelineId: 102938\n');

  const runner = createTaskRunner({
    tasksDir: tasksDirectory,
    request: async ({ tagName }) => ({
      status: 'success',
      pipelineId: '102938',
      tagName,
    }),
    notify(payload) {
      notifications.push(payload);
    },
    now() {
      return '2026-05-21T14:30:00.000Z';
    },
  });

  try {
    await runner.runAll();

    assert.deepEqual(notifications, [
      {
        title: 'GitLab pipeline success',
        message: 'Tag release-1.2.3 pipeline 102938 finished with status success.',
      },
    ]);
    assert.equal(fs.existsSync(processingFile), false);
    assert.equal(fs.existsSync(path.join(tasksDirectory, 'archive', 'success', 'release-1.2.3.md')), true);
    assert.equal(
      fs.readFileSync(path.join(tasksDirectory, 'archive', 'success', 'release-1.2.3.md'), 'utf8'),
      '---\nqueryTime: 2026-05-21T14:30:00.000Z\nstatus: success\npipelineId: 102938\n\n---\nqueryTime: 2026-05-21T14:20:00.000Z\nstatus: running\npipelineId: 102938\n',
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
