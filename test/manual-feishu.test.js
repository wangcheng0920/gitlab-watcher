const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FEISHU_NOTIFICATION,
  runFeishuNotifyCheck,
} = require('./manual-feishu');

test('runFeishuNotifyCheck sends the feishu notification payload and logs messages', async () => {
  const notifications = [];
  const logs = [];

  await runFeishuNotifyCheck({
    notify(payload) {
      notifications.push(payload);
    },
    logger: {
      info(message) {
        logs.push(message);
      },
    },
  });

  assert.deepEqual(notifications, [FEISHU_NOTIFICATION]);
  assert.deepEqual(logs, [
    'Triggering a Feishu notification check...',
    'Feishu notification sent successfully.',
  ]);
});

test('runFeishuNotifyCheck throws when no notify is given and FEISHU_WEBHOOK_URL is not set', async () => {
  const original = process.env.FEISHU_WEBHOOK_URL;
  delete process.env.FEISHU_WEBHOOK_URL;

  try {
    await assert.rejects(
      () => runFeishuNotifyCheck(),
      /FEISHU_WEBHOOK_URL is not set/,
    );
  } finally {
    if (original !== undefined) {
      process.env.FEISHU_WEBHOOK_URL = original;
    }
  }
});
