const fs = require('node:fs/promises');
const path = require('node:path');

const { listMarkdownFiles } = require('../shared/fs');

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

module.exports = {
  clearUnfinishedTasks,
};
