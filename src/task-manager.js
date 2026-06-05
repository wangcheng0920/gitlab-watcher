const fs = require('node:fs/promises');
const path = require('node:path');

const { createTaskFile } = require('./task-create');
const { clearUnfinishedTasks } = require('./task-clear');

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
    const fileNames = await readMarkdownFiles(pathModule.join(tasksDir, directoryName));

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
      const fileNames = await readMarkdownFiles(pathModule.join(tasksDir, 'archive', archiveStatus));

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

  async function readMarkdownFiles(directoryPath) {
    try {
      const entries = await fsModule.readdir(directoryPath);

      return entries
        .filter((name) => name.endsWith('.md'))
        .sort();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }
}

function parseLatestRecord(content) {
  if (!content.startsWith('---\n')) {
    return null;
  }

  const record = {};

  for (const line of content.slice(4).split('\n')) {
    if (!line) {
      break;
    }

    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    record[key] = value;
  }

  return Object.keys(record).length > 0 ? record : null;
}

module.exports = {
  createTaskManager,
};
