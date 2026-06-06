const fs = require('node:fs/promises');

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'EPERM') {
      return true;
    }

    if (error.code === 'ESRCH') {
      return false;
    }

    throw error;
  }
}

async function readExistingPid(pidFile, fsModule = fs) {
  try {
    const content = await fsModule.readFile(pidFile, 'utf8');
    return content.trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

module.exports = {
  isProcessAlive,
  readExistingPid,
};
