const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFeishuNotifier,
  buildCard,
  computeSignature,
  formatLocalTime,
} = require('../../src/notify/feishu');

function mockHttpClient({
  status = 200,
  data = { StatusCode: 0, code: 0, msg: 'success' },
} = {}) {
  return {
    async post(url, body) {
      return {
        status,
        data: { ...data },
      };
    },
  };
}

const SAMPLE_PAYLOAD = {
  tagName: 'release/1.2.3',
  status: 'success',
  pipelineId: '102938',
  finishedAt: '2026-06-06T12:00:00.000Z',
};

test('buildCard produces green header for success status', () => {
  const card = buildCard(SAMPLE_PAYLOAD);

  assert.equal(card.header.template, 'green');
  assert.equal(card.header.title.content, 'GitLab Pipeline 通知');
  assert.ok(card.elements[0].content.includes('release/1.2.3'));
  assert.ok(card.elements[0].content.includes('102938'));
  assert.ok(card.elements[0].content.includes('成功'));
  assert.ok(!card.elements[0].content.includes('2026-06-06T12:00:00.000Z'));
  assert.ok((/\d{4}/).test(card.elements[0].content));
});

test('buildCard produces red header for failed status', () => {
  const card = buildCard({ ...SAMPLE_PAYLOAD, status: 'failed' });

  assert.equal(card.header.template, 'red');
  assert.ok(card.elements[0].content.includes('失败'));
});

test('buildCard produces orange header for canceled status', () => {
  const card = buildCard({ ...SAMPLE_PAYLOAD, status: 'canceled' });

  assert.equal(card.header.template, 'orange');
  assert.ok(card.elements[0].content.includes('已取消'));
});

test('buildCard falls back to blue and raw status text for unknown statuses', () => {
  const card = buildCard({ ...SAMPLE_PAYLOAD, status: 'unknown' });

  assert.equal(card.header.template, 'blue');
  assert.ok(card.elements[0].content.includes('unknown'));
});

test('createFeishuNotifier sends interactive card via webhook POST', async () => {
  let capturedUrl;
  let capturedBody;

  const httpClient = {
    async post(url, body) {
      capturedUrl = url;
      capturedBody = body;

      return { status: 200, data: { StatusCode: 0, code: 0 } };
    },
  };

  const notify = createFeishuNotifier({
    webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook',
    httpClient,
  });

  await notify(SAMPLE_PAYLOAD);

  assert.equal(capturedUrl, 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook');
  assert.equal(capturedBody.msg_type, 'interactive');
  assert.equal(capturedBody.card.header.template, 'green');
  assert.equal(capturedBody.card.header.title.content, 'GitLab Pipeline 通知');
});

test('createFeishuNotifier adds signature when secret is provided', async () => {
  let capturedBody;

  const httpClient = {
    async post(_url, body) {
      capturedBody = body;

      return { status: 200, data: { StatusCode: 0, code: 0 } };
    },
  };

  const notify = createFeishuNotifier({
    webhookUrl: 'https://open.feishu.cn/test',
    secret: 'test-secret',
    httpClient,
  });

  await notify(SAMPLE_PAYLOAD);

  assert.ok(typeof capturedBody.timestamp === 'string');
  assert.ok(capturedBody.timestamp.length > 0);
  assert.ok(typeof capturedBody.sign === 'string');
  assert.ok(capturedBody.sign.length > 0);
});

test('createFeishuNotifier throws on non-200 HTTP response', async () => {
  const notify = createFeishuNotifier({
    webhookUrl: 'https://open.feishu.cn/test',
    httpClient: mockHttpClient({ status: 500 }),
  });

  await assert.rejects(
    () => notify(SAMPLE_PAYLOAD),
    /Feishu webhook returned HTTP 500/,
  );
});

test('createFeishuNotifier throws on Feishu API error response', async () => {
  const notify = createFeishuNotifier({
    webhookUrl: 'https://open.feishu.cn/test',
    httpClient: mockHttpClient({
      status: 200,
      data: { StatusCode: 10001, code: 10001, msg: 'invalid token' },
    }),
  });

  await assert.rejects(
    () => notify(SAMPLE_PAYLOAD),
    /Feishu webhook failed: invalid token/,
  );
});

test('createFeishuNotifier sends card and @mention text when atUsers is configured', async () => {
  const requests = [];

  const httpClient = {
    async post(_url, body) {
      requests.push(body);

      return { status: 200, data: { StatusCode: 0, code: 0 } };
    },
  };

  const notify = createFeishuNotifier({
    webhookUrl: 'https://open.feishu.cn/test',
    atUsers: ['ou_abc', 'ou_def'],
    httpClient,
  });

  await notify(SAMPLE_PAYLOAD);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].msg_type, 'interactive');
  assert.equal(requests[1].msg_type, 'text');
  assert.ok(requests[1].content.text.includes('<at user_id="ou_abc">'));
  assert.ok(requests[1].content.text.includes('<at user_id="ou_def">'));
});

test('createFeishuNotifier does not throw when @mention text response indicates failure', async () => {
  let callCount = 0;

  const httpClient = {
    async post(_url, _body) {
      callCount += 1;

      if (callCount === 1) {
        return { status: 200, data: { StatusCode: 0, code: 0 } };
      }

      return { status: 500, data: {} };
    },
  };

  const notify = createFeishuNotifier({
    webhookUrl: 'https://open.feishu.cn/test',
    atUsers: ['ou_abc'],
    httpClient,
  });

  await notify(SAMPLE_PAYLOAD);

  assert.equal(callCount, 2);
});

test('createFeishuNotifier throws with StatusMessage when msg field is absent', async () => {
  const notify = createFeishuNotifier({
    webhookUrl: 'https://open.feishu.cn/test',
    httpClient: mockHttpClient({
      status: 200,
      data: { StatusCode: 10001, code: 10001, StatusMessage: 'token expired' },
    }),
  });

  await assert.rejects(
    () => notify(SAMPLE_PAYLOAD),
    /Feishu webhook failed: token expired/,
  );
});

test('createFeishuNotifier throws when webhookUrl is not provided', () => {
  assert.throws(
    () => createFeishuNotifier({}),
    /FEISHU_WEBHOOK_URL is required/,
  );
});

test('computeSignature produces correct HMAC-SHA256 Base64', () => {
  const sign = computeSignature('1625551212', 'test-secret');

  assert.ok(typeof sign === 'string');
  assert.ok(sign.length > 0);

  const sign2 = computeSignature('1625551212', 'test-secret');

  assert.equal(sign, sign2);
});

test('formatLocalTime converts ISO string to local time without UTC suffix', () => {
  const result = formatLocalTime('2026-06-06T12:00:00.000Z');

  assert.ok(typeof result === 'string');
  assert.ok(result.length > 0);
  assert.ok(!result.includes('T'));
  assert.ok(!result.includes('Z'));
  assert.ok((/\d{4}/).test(result));
});
