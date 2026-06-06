const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let createTaskFile;
let mapTagToTaskFileName;

try {
  ({ createTaskFile, mapTagToTaskFileName } = require('../../src/task/create'));
} catch {
  createTaskFile = undefined;
  mapTagToTaskFileName = undefined;
}

function createTasksDirectory() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-watcher-create-task-'));
  const tasksDirectory = path.join(tempDirectory, 'tasks');

  fs.mkdirSync(path.join(tasksDirectory, 'pending'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'processing'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'archive', 'success'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'archive', 'failed'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'archive', 'canceled'), { recursive: true });

  return tempDirectory;
}

test('mapTagToTaskFileName encodes path separators in tags', () => {
  assert.equal(typeof mapTagToTaskFileName, 'function');
  assert.equal(mapTagToTaskFileName('release/1.2.3'), 'release%2F1.2.3.md');
});

test('createTaskFile writes a pending task file with the original tag and createdAt metadata', async () => {
  const tempDirectory = createTasksDirectory();
  const tasksDirectory = path.join(tempDirectory, 'tasks');

  try {
    assert.equal(typeof createTaskFile, 'function');

    const filePath = await createTaskFile({
      tagName: 'release/1.2.3',
      tasksDir: tasksDirectory,
      now: () => '2026-05-22T03:00:00.000Z',
    });

    assert.equal(filePath, path.join(tasksDirectory, 'pending', 'release%2F1.2.3.md'));
    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      'tag: release/1.2.3\ncreatedAt: 2026-05-22T03:00:00.000Z\n',
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('createTaskFile rejects tags that already exist in archived tasks', async () => {
  const tempDirectory = createTasksDirectory();
  const tasksDirectory = path.join(tempDirectory, 'tasks');
  const existingFile = path.join(tasksDirectory, 'archive', 'success', 'release%2F1.2.3.md');

  fs.writeFileSync(existingFile, 'tag: release/1.2.3\n');

  try {
    assert.equal(typeof createTaskFile, 'function');

    await assert.rejects(
      () => createTaskFile({
        tagName: 'release/1.2.3',
        tasksDir: tasksDirectory,
        now: () => '2026-05-22T03:00:00.000Z',
      }),
      /Task already exists for tag "release\/1\.2\.3"\./,
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
