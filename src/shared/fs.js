const fs = require('node:fs/promises');

async function listMarkdownFiles(directoryPath, fsModule = fs) {
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

async function readFileIfExists(filePath, fsModule = fs) {
  try {
    return await fsModule.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

module.exports = {
  listMarkdownFiles,
  readFileIfExists,
};
