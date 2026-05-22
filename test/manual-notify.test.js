const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MANUAL_NOTIFICATION,
  runManualNotifyCheck,
} = require('./manual-notify');

test('runManualNotifyCheck sends the default manual notification payload', () => {
  const notifications = [];
  const logs = [];

  runManualNotifyCheck({
    notify(payload) {
      notifications.push(payload);
    },
    logger: {
      info(message) {
        logs.push(message);
      },
    },
  });

  assert.deepEqual(notifications, [DEFAULT_MANUAL_NOTIFICATION]);
  assert.deepEqual(logs, [
    'Triggering a real notification check...',
    'Notification request sent. On macOS this should open a blocking alert that must be closed manually.',
  ]);
});
