const fs = require('node:fs/promises');
const path = require('node:path');

async function clearUnfinishedTasks({
  tasksDir = path.join(process.cwd(), 'tasks'),
  fsModule = fs,
  pathModule = path,
} = {}) {
  const directories = ['pending', 'processing'];
  let deletedCount = 0;

  for (const directoryName of directories) {
    const directoryPath = pathModule.join(tasksDir, directoryName);
    const fileNames = await listMarkdownFiles(directoryPath, fsModule);

    for (const fileName of fileNames) {
      await fsModule.unlink(pathModule.join(directoryPath, fileName));
      deletedCount += 1;
    }
  }

  return deletedCount;
}

async function runTaskClear({
  clearTasks = clearUnfinishedTasks,
  stdout = process.stdout,
} = {}) {
  const clearedCount = await clearTasks();

  stdout.write(`Cleared unfinished tasks: ${clearedCount}\n`);
}

async function listMarkdownFiles(directoryPath, fsModule) {
  try {
    const directoryEntries = await fsModule.readdir(directoryPath);

    return directoryEntries
      .filter((fileName) => fileName.endsWith('.md'))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

if (require.main === module) {
  runTaskClear().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  clearUnfinishedTasks,
  runTaskClear,
};
