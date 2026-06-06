const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTaskManager } = require('../../src/task/manager');

function createTasksDirectory() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-watcher-manager-'));
  const tasks = path.join(tmp, 'tasks');

  fs.mkdirSync(path.join(tasks, 'pending'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'processing'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'archive', 'success'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'archive', 'failed'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'archive', 'canceled'), { recursive: true });

  return tmp;
}

test('createTask creates a pending task file with encoded tag', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const filePath = await manager.createTask({ tagName: 'release/1.2.3' });

    assert.ok(filePath.endsWith('release%2F1.2.3.md'));
    assert.ok(fs.existsSync(filePath));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('createTask rejects duplicate tags', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    await manager.createTask({ tagName: 'release/1.2.3' });

    await assert.rejects(
      () => manager.createTask({ tagName: 'release/1.2.3' }),
      /Task already exists/,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listTasks with status=pending returns only pending tasks', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    await manager.createTask({ tagName: 'release/1.0.0' });
    await manager.createTask({ tagName: 'release/2.0.0' });
    fs.writeFileSync(path.join(tasksDir, 'processing', 'release%2F3.0.0.md'), '');

    const tasks = await manager.listTasks({ status: 'pending' });

    assert.equal(tasks.length, 2);
    assert.deepEqual(tasks.map((t) => t.tag), ['release/1.0.0', 'release/2.0.0']);
    assert(tasks.every((t) => t.status === 'pending'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listTasks with status=processing returns only processing tasks', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    fs.writeFileSync(path.join(tasksDir, 'processing', 'release%2F1.0.0.md'), '');

    const tasks = await manager.listTasks({ status: 'processing' });

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].tag, 'release/1.0.0');
    assert.equal(tasks[0].status, 'processing');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listTasks with status=archive returns tasks across all archive subdirectories', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    fs.writeFileSync(path.join(tasksDir, 'archive', 'success', 'release%2F1.0.0.md'), '');
    fs.writeFileSync(path.join(tasksDir, 'archive', 'failed', 'release%2F2.0.0.md'), '');

    const tasks = await manager.listTasks({ status: 'archive' });

    assert.equal(tasks.length, 2);
    assert.deepEqual(
      tasks.map((t) => ({ tag: t.tag, status: t.status })),
      [
        { tag: 'release/1.0.0', status: 'success' },
        { tag: 'release/2.0.0', status: 'failed' },
      ],
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listTasks without status returns all tasks across all directories', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    await manager.createTask({ tagName: 'pending-task' });
    fs.writeFileSync(path.join(tasksDir, 'processing', 'processing-task.md'), '');
    fs.writeFileSync(path.join(tasksDir, 'archive', 'success', 'archive-task.md'), '');

    const tasks = await manager.listTasks();

    assert.equal(tasks.length, 3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('getTask returns task details when found in processing', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const content = '---\nqueryTime: 2026-01-01T00:00:00.000Z\nstatus: running\npipelineId: 123\n';
    fs.writeFileSync(path.join(tasksDir, 'processing', 'release%2F1.0.0.md'), content);

    const task = await manager.getTask({ tagName: 'release/1.0.0' });

    assert.ok(task);
    assert.equal(task.tag, 'release/1.0.0');
    assert.equal(task.status, 'processing');
    assert.equal(task.content, content);
    assert.deepEqual(task.latestRecord, {
      queryTime: '2026-01-01T00:00:00.000Z',
      status: 'running',
      pipelineId: '123',
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('getTask returns null when not found', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const task = await manager.getTask({ tagName: 'nonexistent' });

    assert.equal(task, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('getTask finds task in archive directories', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const content = '---\nqueryTime: 2026-01-01T00:00:00.000Z\nstatus: success\npipelineId: 456\n';
    fs.writeFileSync(path.join(tasksDir, 'archive', 'success', 'release%2F1.0.0.md'), content);

    const task = await manager.getTask({ tagName: 'release/1.0.0' });

    assert.ok(task);
    assert.equal(task.status, 'success');
    assert.deepEqual(task.latestRecord, {
      queryTime: '2026-01-01T00:00:00.000Z',
      status: 'success',
      pipelineId: '456',
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('deleteTask removes task from pending directory', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const filePath = await manager.createTask({ tagName: 'release/1.0.0' });

    assert.ok(fs.existsSync(filePath));

    const deleted = await manager.deleteTask({ tagName: 'release/1.0.0' });

    assert.equal(deleted, true);
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('deleteTask returns false when task not found', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const deleted = await manager.deleteTask({ tagName: 'nonexistent' });

    assert.equal(deleted, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('clearUnfinishedTasks removes pending and processing markdown files', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    await manager.createTask({ tagName: 'pending-task' });
    fs.writeFileSync(path.join(tasksDir, 'processing', 'processing-task.md'), '');
    fs.writeFileSync(path.join(tasksDir, 'archive', 'success', 'archive-task.md'), '');

    const deletedCount = await manager.clearUnfinishedTasks();

    assert.equal(deletedCount, 2);
    assert.deepEqual(await manager.listTasks({ status: 'pending' }), []);
    assert.deepEqual(await manager.listTasks({ status: 'processing' }), []);
    assert.equal((await manager.listTasks({ status: 'archive' })).length, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
