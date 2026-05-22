const nodeNotifier = require('node-notifier');
const { execFileSync } = require('node:child_process');

function createNotifier({
  notifier = nodeNotifier,
  platform = process.platform,
  osascriptRunner = runOsascript,
} = {}) {
  return function notify(payload) {
    if (platform === 'darwin') {
      osascriptRunner(buildDisplayAlertScript(payload));
      return;
    }

    notifier.notify({
      title: payload.title,
      message: payload.message,
    });
  };
}

function buildDisplayAlertScript(payload) {
  return `display alert "${escapeAppleScriptString(payload.title)}" message "${escapeAppleScriptString(payload.message)}"`;
}

function escapeAppleScriptString(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
}

function runOsascript(script) {
  execFileSync('osascript', ['-e', script], {
    stdio: 'ignore',
  });
}

module.exports = {
  createNotifier,
};
