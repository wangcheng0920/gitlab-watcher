const fs = require('node:fs/promises');
const path = require('node:path');

const { parseLatestRecord } = require('../shared/parse-record');
const { listMarkdownFiles, readFileIfExists } = require('../shared/fs');

const NOTIFY_ERROR_STATUS = 'notify_error';
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
      listMarkdownFiles(pathModule.join(tasksDir, 'pending')),
      listMarkdownFiles(pathModule.join(tasksDir, 'processing')),
    ]);

    for (const fileName of pendingFiles) {
      await runTask(fileName, 'pending');
    }

    for (const fileName of processingFiles) {
      await runTask(fileName, 'processing');
    }

    return buildSummary();
  }

  async function runTask(fileName, sourceDirectory) {
    if (activeTasks.has(fileName)) {
      return;
    }

    activeTasks.add(fileName);

    try {
      const tagName = decodeURIComponent(fileName.replace(/\.md$/, ''));
      let currentPath = pathModule.join(tasksDir, sourceDirectory, fileName);

      if (sourceDirectory === 'pending') {
        const processingPath = pathModule.join(tasksDir, 'processing', fileName);

        await fsModule.rename(currentPath, processingPath);
        currentPath = processingPath;
      }

      const latestRecord = await readLatestRecord(currentPath);

      if (
        latestRecord?.status === NOTIFY_ERROR_STATUS
        && latestRecord.terminalStatus
        && latestRecord.pipelineId
      ) {
        await retryNotification({
          tagName,
          fileName,
          currentPath,
          terminalStatus: latestRecord.terminalStatus,
          pipelineId: latestRecord.pipelineId,
        });
        return;
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

      try {
        notify(buildNotification({
          tagName,
          status: queryResult.status,
          pipelineId: queryResult.pipelineId,
        }));
      } catch (error) {
        await prependRecord(currentPath, {
          queryTime: now(),
          status: NOTIFY_ERROR_STATUS,
          terminalStatus: queryResult.status,
          pipelineId: queryResult.pipelineId,
        });
        logger.error('Task notification failed.', error);
        return;
      }

      await fsModule.rename(
        currentPath,
        pathModule.join(tasksDir, 'archive', queryResult.status, fileName),
      );
    } finally {
      activeTasks.delete(fileName);
    }
  }

  async function retryNotification({
    tagName,
    fileName,
    currentPath,
    terminalStatus,
    pipelineId,
  }) {
    try {
      notify(buildNotification({
        tagName,
        status: terminalStatus,
        pipelineId,
      }));
    } catch (error) {
      await prependRecord(currentPath, {
        queryTime: now(),
        status: NOTIFY_ERROR_STATUS,
        terminalStatus,
        pipelineId,
      });
      logger.error('Task notification failed.', error);
      return;
    }

    await prependRecord(currentPath, {
      queryTime: now(),
      status: terminalStatus,
      pipelineId,
    });

    await fsModule.rename(
      currentPath,
      pathModule.join(tasksDir, 'archive', terminalStatus, fileName),
    );
  }

  async function prependRecord(filePath, record) {
    const existingContent = await readFileIfExists(filePath);
    let nextContent = `---\nqueryTime: ${record.queryTime}\nstatus: ${record.status}\n`;

    if (record.terminalStatus) {
      nextContent += `terminalStatus: ${record.terminalStatus}\n`;
    }

    if (record.pipelineId) {
      nextContent += `pipelineId: ${record.pipelineId}\n`;
    }

    if (existingContent) {
      nextContent += `\n${existingContent}`;
    }

    await fsModule.writeFile(filePath, nextContent, 'utf8');
  }

  async function readLatestRecord(filePath) {
    const content = await readFileIfExists(filePath);

    return parseLatestRecord(content);
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

  async function buildSummary() {
    const [pendingFiles, processingFiles] = await Promise.all([
      listMarkdownFiles(pathModule.join(tasksDir, 'pending')),
      listMarkdownFiles(pathModule.join(tasksDir, 'processing')),
    ]);

    return {
      pendingCount: pendingFiles.length,
      processingCount: processingFiles.length,
      hasUnfinishedTasks: pendingFiles.length > 0 || processingFiles.length > 0,
    };
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
