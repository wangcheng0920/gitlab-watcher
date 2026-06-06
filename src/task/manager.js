const fs = require('node:fs/promises');
const path = require('node:path');

const { parseLatestRecord } = require('../shared/parse-record');
const { listMarkdownFiles } = require('../shared/fs');
const { createTaskFile } = require('./create');
const { clearUnfinishedTasks } = require('./clear');

const STATUS_DIRECTORIES = ['pending', 'processing'];
const ARCHIVE_STATUSES = ['success', 'failed', 'canceled'];

function createTaskManager({
  tasksDir = path.join(process.cwd(), 'tasks'),
  fsModule = fs,
  pathModule = path,
} = {}) {
  return {
    createTask,
    listTasks,
    getTask,
    deleteTask,
    clearUnfinishedTasks: runClearUnfinishedTasks,
  };

  async function createTask({ tagName }) {
    return createTaskFile({
      tagName,
      tasksDir,
      fsModule,
      pathModule,
    });
  }

  async function listTasks({ status } = {}) {
    if (status === 'archive') {
      return listArchiveTasks();
    }

    if (status && STATUS_DIRECTORIES.includes(status)) {
      return listDirectoryTasks(status);
    }

    const pendingTasks = await listDirectoryTasks('pending');
    const processingTasks = await listDirectoryTasks('processing');
    const archiveTasks = await listArchiveTasks();

    return [...pendingTasks, ...processingTasks, ...archiveTasks];
  }

  async function listDirectoryTasks(directoryName) {
    const fileNames = await listMarkdownFiles(pathModule.join(tasksDir, directoryName));

    return fileNames.map((fileName) => {
      const tagName = decodeURIComponent(fileName.replace(/\.md$/, ''));

      return {
        tag: tagName,
        status: directoryName,
      };
    });
  }

  async function listArchiveTasks() {
    const tasks = [];

    for (const archiveStatus of ARCHIVE_STATUSES) {
      const fileNames = await listMarkdownFiles(pathModule.join(tasksDir, 'archive', archiveStatus));

      for (const fileName of fileNames) {
        const tagName = decodeURIComponent(fileName.replace(/\.md$/, ''));

        tasks.push({
          tag: tagName,
          status: archiveStatus,
        });
      }
    }

    return tasks;
  }

  async function getTask({ tagName }) {
    const fileName = encodeURIComponent(tagName) + '.md';
    const candidatePaths = [
      pathModule.join(tasksDir, 'pending', fileName),
      pathModule.join(tasksDir, 'processing', fileName),
      ...ARCHIVE_STATUSES.map((s) => pathModule.join(tasksDir, 'archive', s, fileName)),
    ];

    for (const candidatePath of candidatePaths) {
      try {
        const content = await fsModule.readFile(candidatePath, 'utf8');
        const relativePath = pathModule.relative(tasksDir, candidatePath);
        const directoryName = relativePath.split(pathModule.sep)[0];

        return {
          tag: tagName,
          status: directoryName === 'archive'
            ? relativePath.split(pathModule.sep)[1]
            : directoryName,
          filePath: candidatePath,
          content,
          latestRecord: parseLatestRecord(content),
        };
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return null;
  }

  async function deleteTask({ tagName }) {
    const fileName = encodeURIComponent(tagName) + '.md';
    const candidatePaths = [
      pathModule.join(tasksDir, 'pending', fileName),
      pathModule.join(tasksDir, 'processing', fileName),
      ...ARCHIVE_STATUSES.map((s) => pathModule.join(tasksDir, 'archive', s, fileName)),
    ];

    for (const candidatePath of candidatePaths) {
      try {
        await fsModule.unlink(candidatePath);
        return true;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return false;
  }

  async function runClearUnfinishedTasks() {
    return clearUnfinishedTasks({ tasksDir, fsModule, pathModule });
  }
}

module.exports = {
  createTaskManager,
};
