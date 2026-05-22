const fs = require('node:fs/promises');
const path = require('node:path');

const ARCHIVE_STATUSES = ['success', 'failed', 'canceled'];

function mapTagToTaskFileName(tagName) {
  return `${encodeURIComponent(tagName)}.md`;
}

async function createTaskFile({
  tagName,
  tasksDir = path.join(process.cwd(), 'tasks'),
  now = () => new Date().toISOString(),
  fsModule = fs,
  pathModule = path,
} = {}) {
  const normalizedTagName = normalizeTagName(tagName);
  const fileName = mapTagToTaskFileName(normalizedTagName);
  const pendingPath = pathModule.join(tasksDir, 'pending', fileName);

  await fsModule.mkdir(pathModule.join(tasksDir, 'pending'), { recursive: true });

  if (await taskExists({
    fileName,
    tasksDir,
    fsModule,
    pathModule,
  })) {
    throw new Error(`Task already exists for tag "${normalizedTagName}".`);
  }

  try {
    await fsModule.writeFile(
      pendingPath,
      `tag: ${normalizedTagName}\ncreatedAt: ${now()}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Task already exists for tag "${normalizedTagName}".`);
    }

    throw error;
  }

  return pendingPath;
}

function normalizeTagName(tagName) {
  if (typeof tagName !== 'string') {
    throw new Error('Tag is required.');
  }

  const normalizedTagName = tagName.trim();

  if (!normalizedTagName) {
    throw new Error('Tag is required.');
  }

  return normalizedTagName;
}

async function taskExists({ fileName, tasksDir, fsModule, pathModule }) {
  const candidatePaths = [
    pathModule.join(tasksDir, 'pending', fileName),
    pathModule.join(tasksDir, 'processing', fileName),
    ...ARCHIVE_STATUSES.map((status) => pathModule.join(tasksDir, 'archive', status, fileName)),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      await fsModule.access(candidatePath);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return false;
}

module.exports = {
  createTaskFile,
  mapTagToTaskFileName,
};
