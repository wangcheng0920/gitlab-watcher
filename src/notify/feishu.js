const crypto = require('node:crypto');
const axios = require('axios');

const STATUS_TEMPLATE_MAP = {
  success: 'green',
  failed: 'red',
  canceled: 'orange',
};

const STATUS_LABEL_MAP = {
  success: '成功',
  failed: '失败',
  canceled: '已取消',
};

function createFeishuNotifier({
  webhookUrl,
  secret,
  atUsers = [],
  httpClient = axios,
} = {}) {
  if (!webhookUrl) {
    throw new Error('FEISHU_WEBHOOK_URL is required');
  }

  return async function notify(payload) {
    // Always send interactive card first
    const cardBody = { msg_type: 'interactive', card: buildCard(payload) };
    addSignature(cardBody, secret);

    let response = await httpClient.post(webhookUrl, cardBody, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      throw new Error(`Feishu webhook returned HTTP ${response.status}`);
    }

    const result = response.data;

    if (result.StatusCode !== 0 || result.code !== 0) {
      throw new Error(
        `Feishu webhook failed: ${result.msg || result.StatusMessage || 'unknown error'}`,
      );
    }

    // If @mentions configured, send an additional text message to trigger alert
    if (atUsers.length > 0) {
      const mentionText = atUsers.map((id) => `<at user_id="${id}"></at>`).join(' ');
      const textBody = { msg_type: 'text', content: { text: mentionText } };
      addSignature(textBody, secret);

      response = await httpClient.post(webhookUrl, textBody, {
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });

      // @mention failure is non-fatal — card already delivered
      if (response.status !== 200 || (response.data.StatusCode !== 0 || response.data.code !== 0)) {
        console.error(
          `@mention text notification had issues: HTTP ${response.status}`,
        );
      }
    }
  };
}

function buildCard({ tagName, status, pipelineId, finishedAt }) {
  const template = STATUS_TEMPLATE_MAP[status] || 'blue';
  const label = STATUS_LABEL_MAP[status] || status;

  return {
    header: {
      title: {
        tag: 'plain_text',
        content: 'GitLab Pipeline 通知',
      },
      template,
    },
    elements: [
      {
        tag: 'markdown',
        content: [
          `**Tag:** ${tagName}`,
          `**Pipeline:** #${pipelineId}`,
          `**状态:** ${label}`,
          `**时间:** ${formatLocalTime(finishedAt)}`,
        ].join('\n'),
      },
    ],
  };
}

function formatLocalTime(isoString) {
  const date = new Date(isoString);

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function addSignature(body, secret) {
  if (secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    body.timestamp = timestamp;
    body.sign = computeSignature(timestamp, secret);
  }
}

function computeSignature(timestamp, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}\n${secret}`);
  return hmac.digest('base64');
}

module.exports = {
  createFeishuNotifier,
  buildCard,
  computeSignature,
  formatLocalTime,
};
