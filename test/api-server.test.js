const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApiServer } = require('../src/api-server');
const { createTaskManager } = require('../src/task-manager');

function createTasksDirectory() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-watcher-api-'));
  const tasks = path.join(tmp, 'tasks');

  fs.mkdirSync(path.join(tasks, 'pending'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'processing'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'archive', 'success'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'archive', 'failed'), { recursive: true });
  fs.mkdirSync(path.join(tasks, 'archive', 'canceled'), { recursive: true });

  return tmp;
}

test('POST /tasks creates a task and returns 201', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    const response = await server.inject({
      method: 'POST',
      url: '/tasks',
      payload: { tag: 'release/1.2.3' },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().tag, 'release/1.2.3');

    const tasks = await manager.listTasks({ status: 'pending' });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].tag, 'release/1.2.3');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('POST /tasks returns 409 for duplicate tag', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    await server.inject({
      method: 'POST',
      url: '/tasks',
      payload: { tag: 'release/1.2.3' },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/tasks',
      payload: { tag: 'release/1.2.3' },
    });

    assert.equal(response.statusCode, 409);
    assert.ok(response.json().error.includes('already exists'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('POST /tasks returns 400 for missing tag', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    const response = await server.inject({
      method: 'POST',
      url: '/tasks',
      payload: {},
    });

    assert.equal(response.statusCode, 400);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('GET /tasks lists tasks with status filter', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    await manager.createTask({ tagName: 'release/1.0.0' });
    await manager.createTask({ tagName: 'release/2.0.0' });

    const response = await server.inject({
      method: 'GET',
      url: '/tasks?status=pending',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().tasks.length, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('GET /task returns task details', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });
    const filePath = path.join(tasksDir, 'processing', 'release%2F1.0.0.md');

    fs.writeFileSync(
      filePath,
      '---\nqueryTime: 2026-01-01T00:00:00.000Z\nstatus: running\npipelineId: 123\n',
    );

    const response = await server.inject({
      method: 'GET',
      url: '/task?tag=release/1.0.0',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().tag, 'release/1.0.0');
    assert.equal(response.json().status, 'processing');
    assert.equal(response.json().latestRecord.status, 'running');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('GET /task returns 404 when not found', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    const response = await server.inject({
      method: 'GET',
      url: '/task?tag=nonexistent',
    });

    assert.equal(response.statusCode, 404);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DELETE /task removes task and returns success', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    await manager.createTask({ tagName: 'release/1.0.0' });

    const response = await server.inject({
      method: 'DELETE',
      url: '/task?tag=release/1.0.0',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().deleted, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DELETE /task returns 404 for nonexistent task', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    const response = await server.inject({
      method: 'DELETE',
      url: '/task?tag=nonexistent',
    });

    assert.equal(response.statusCode, 404);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DELETE /tasks clears unfinished tasks and returns count', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    await manager.createTask({ tagName: 'task-1' });
    await manager.createTask({ tagName: 'task-2' });

    const response = await server.inject({
      method: 'DELETE',
      url: '/tasks',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().deletedCount, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('GET /health returns ok status and task counts', async () => {
  const tmp = createTasksDirectory();
  const tasksDir = path.join(tmp, 'tasks');

  try {
    const manager = createTaskManager({ tasksDir });
    const server = createApiServer({ taskManager: manager, logger: false });

    await manager.createTask({ tagName: 'task-1' });

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'ok');
    assert.equal(response.json().pendingCount, 1);
    assert.equal(response.json().processingCount, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
