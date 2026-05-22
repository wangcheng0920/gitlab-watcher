const { createNotifier } = require('../src/notify');

const DEFAULT_MANUAL_NOTIFICATION = {
  title: 'GitLab Watcher Alert Test',
  message: 'This alert should stay open until you close it manually.',
};

function runManualNotifyCheck({
  notify = createNotifier(),
  logger = console,
} = {}) {
  logger.info('Triggering a real notification check...');
  notify(DEFAULT_MANUAL_NOTIFICATION);
  logger.info('Notification request sent. On macOS this should open a blocking alert that must be closed manually.');
}

if (require.main === module) {
  runManualNotifyCheck();
}

module.exports = {
  DEFAULT_MANUAL_NOTIFICATION,
  runManualNotifyCheck,
};
