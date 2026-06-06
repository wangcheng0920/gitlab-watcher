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
  parseLatestRecord,
};
