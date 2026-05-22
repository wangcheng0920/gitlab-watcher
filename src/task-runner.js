const fs = require('node:fs/promises');
const path = require('node:path');

const TERMINAL_STATUSES = new Set(['success', 'failed', 'canceled']);

function createTaskRunner({
  tasksDir = path.join(process.cwd(), 'tasks'),
  request,
  notify,
  logger = console,
  now = () => new Date().toISOString(),
  fsModule = fs,
  pathModule = path,
} = {}) {
  const activeTasks = new Set();

  return {
    runAll,
  };

  async function runAll() {
    await ensureTaskDirectories();

    const [pendingFiles, processingFiles] = await Promise.all([
      listMarkdownFiles('pending'),
      listMarkdownFiles('processing'),
    ]);

    for (const fileName of pendingFiles) {
      await runTask(fileName, 'pending');
    }

    for (const fileName of processingFiles) {
      await runTask(fileName, 'processing');
    }
  }

  async function runTask(fileName, sourceDirectory) {
    if (activeTasks.has(fileName)) {
      return;
    }

    activeTasks.add(fileName);

    try {
      const tagName = fileName.replace(/\.md$/, '');
      let currentPath = pathModule.join(tasksDir, sourceDirectory, fileName);

      if (sourceDirectory === 'pending') {
        const processingPath = pathModule.join(tasksDir, 'processing', fileName);

        await fsModule.rename(currentPath, processingPath);
        currentPath = processingPath;
      }

      let queryResult;

      try {
        queryResult = await request({ tagName });
      } catch (error) {
        await prependRecord(currentPath, {
          queryTime: now(),
          status: 'query_error',
        });
        logger.info?.(`Query result: tag=${tagName} status=query_error`);
        logger.error('Task query failed.', error);
        return;
      }

      await prependRecord(currentPath, {
        queryTime: now(),
        status: queryResult.status,
        pipelineId: queryResult.pipelineId,
      });
      logger.info?.(`Query result: tag=${tagName} status=${queryResult.status}`);

      if (!TERMINAL_STATUSES.has(queryResult.status)) {
        return;
      }

      notify(buildNotification({
        tagName,
        status: queryResult.status,
        pipelineId: queryResult.pipelineId,
      }));

      await fsModule.rename(
        currentPath,
        pathModule.join(tasksDir, 'archive', queryResult.status, fileName),
      );
    } finally {
      activeTasks.delete(fileName);
    }
  }

  async function prependRecord(filePath, record) {
    const existingContent = await readFileIfExists(filePath);
    let nextContent = `---\nqueryTime: ${record.queryTime}\nstatus: ${record.status}\n`;

    if (record.pipelineId) {
      nextContent += `pipelineId: ${record.pipelineId}\n`;
    }

    if (existingContent) {
      nextContent += `\n${existingContent}`;
    }

    await fsModule.writeFile(filePath, nextContent, 'utf8');
  }

  async function readFileIfExists(filePath) {
    try {
      return await fsModule.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        return '';
      }

      throw error;
    }
  }

  async function listMarkdownFiles(directoryName) {
    try {
      const directoryEntries = await fsModule.readdir(pathModule.join(tasksDir, directoryName));

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

  async function ensureTaskDirectories() {
    await Promise.all([
      fsModule.mkdir(pathModule.join(tasksDir, 'pending'), { recursive: true }),
      fsModule.mkdir(pathModule.join(tasksDir, 'processing'), { recursive: true }),
      fsModule.mkdir(pathModule.join(tasksDir, 'archive', 'success'), { recursive: true }),
      fsModule.mkdir(pathModule.join(tasksDir, 'archive', 'failed'), { recursive: true }),
      fsModule.mkdir(pathModule.join(tasksDir, 'archive', 'canceled'), { recursive: true }),
    ]);
  }
}

function buildNotification({ tagName, status, pipelineId }) {
  return {
    title: `GitLab pipeline ${status}`,
    message: `Tag ${tagName} pipeline ${pipelineId} finished with status ${status}.`,
  };
}

module.exports = {
  createTaskRunner,
};
