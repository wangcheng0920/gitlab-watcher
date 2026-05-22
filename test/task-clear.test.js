const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let clearUnfinishedTasks;
let runTaskClear;

try {
  ({ clearUnfinishedTasks, runTaskClear } = require('../src/task-clear'));
} catch {
  clearUnfinishedTasks = undefined;
  runTaskClear = undefined;
}

function createTasksDirectory() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-watcher-clear-task-'));
  const tasksDirectory = path.join(tempDirectory, 'tasks');

  fs.mkdirSync(path.join(tasksDirectory, 'pending'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'processing'), { recursive: true });
  fs.mkdirSync(path.join(tasksDirectory, 'archive', 'success'), { recursive: true });

  return tempDirectory;
}

test('clearUnfinishedTasks deletes markdown files from pending and processing only', async () => {
  const tempDirectory = createTasksDirectory();
  const tasksDirectory = path.join(tempDirectory, 'tasks');
  const pendingFile = path.join(tasksDirectory, 'pending', 'release-1.2.3.md');
  const processingFile = path.join(tasksDirectory, 'processing', 'release-1.2.4.md');
  const archiveFile = path.join(tasksDirectory, 'archive', 'success', 'release-1.2.5.md');
  const noteFile = path.join(tasksDirectory, 'pending', 'README.txt');

  fs.writeFileSync(pendingFile, '');
  fs.writeFileSync(processingFile, '');
  fs.writeFileSync(archiveFile, 'archived');
  fs.writeFileSync(noteFile, 'keep');

  try {
    assert.equal(typeof clearUnfinishedTasks, 'function');

    const deletedCount = await clearUnfinishedTasks({
      tasksDir: tasksDirectory,
    });

    assert.equal(deletedCount, 2);
    assert.equal(fs.existsSync(pendingFile), false);
    assert.equal(fs.existsSync(processingFile), false);
    assert.equal(fs.existsSync(archiveFile), true);
    assert.equal(fs.existsSync(noteFile), true);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('runTaskClear writes the cleared unfinished task count to stdout', async () => {
  const writes = [];

  assert.equal(typeof runTaskClear, 'function');

  await runTaskClear({
    clearTasks: async () => 2,
    stdout: {
      write(value) {
        writes.push(value);
      },
    },
  });

  assert.deepEqual(writes, ['Cleared unfinished tasks: 2\n']);
});
