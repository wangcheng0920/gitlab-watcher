require('dotenv').config({ quiet: true });

const { createFeishuNotifier } = require('../src/notify/feishu');

const FEISHU_NOTIFICATION = {
  title: 'GitLab pipeline success',
  message: 'Tag release/1.2.3 pipeline 102938 finished with status success.',
  tagName: 'release/1.2.3',
  status: 'success',
  pipelineId: '102938',
  finishedAt: new Date().toISOString(),
};

async function runFeishuNotifyCheck({
  notify,
  logger = console,
} = {}) {
  const atUsers = process.env.FEISHU_AT_USERS
    ? process.env.FEISHU_AT_USERS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  if (!notify) {
    const webhookUrl = process.env.FEISHU_WEBHOOK_URL;

    if (!webhookUrl) {
      throw new Error(
        'FEISHU_WEBHOOK_URL is not set. Please configure it in .env or pass a custom notify function.',
      );
    }

    notify = createFeishuNotifier({
      webhookUrl,
      secret: process.env.FEISHU_WEBHOOK_SECRET,
      atUsers,
    });
  }

  logger.info('Triggering a Feishu notification check...');
  logger.info(atUsers.length > 0
    ? `Mode: card + @mention text (${atUsers.length} user(s))`
    : 'Mode: card only (no @mentions)');
  await notify(FEISHU_NOTIFICATION);
  logger.info('Feishu notification sent successfully.');
}

if (require.main === module) {
  (async () => {
    try {
      await runFeishuNotifyCheck();
    } catch (error) {
      console.error('Feishu notification failed.', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  FEISHU_NOTIFICATION,
  runFeishuNotifyCheck,
};
