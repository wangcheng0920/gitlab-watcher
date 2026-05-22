const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/index');

test('createApp restores unfinished tasks on start and reuses the same runner on cron ticks', async () => {
  let scheduledExpression;
  let scheduledCallback;

  const cron = {
    schedule(expression, callback) {
      scheduledExpression = expression;
      scheduledCallback = callback;

      return {
        expression,
        callback,
      };
    },
  };

  let runAllCount = 0;

  const app = createApp({
    cron,
    config: { cronExpression: '*/10 * * * *' },
    runner: {
      async runAll() {
        runAllCount += 1;
      },
    },
    logger: {
      info() {},
      error() {},
    },
  });

  const task = await app.start();

  assert.equal(scheduledExpression, '*/10 * * * *');
  assert.deepEqual(task, {
    expression: '*/10 * * * *',
    callback: scheduledCallback,
  });
  assert.equal(runAllCount, 1);

  await scheduledCallback();

  assert.equal(runAllCount, 2);
});

test('createApp runs once immediately on start and uses the default three-minute schedule', async () => {
  let scheduledExpression;
  let scheduledCallback;
  let runAllCount = 0;

  const app = createApp({
    cron: {
      schedule(expression, callback) {
        scheduledExpression = expression;
        scheduledCallback = callback;

        return {
          expression,
          callback,
        };
      },
    },
    runner: {
      async runAll() {
        runAllCount += 1;
      },
    },
    logger: {
      info() {},
      error() {},
    },
  });

  const task = await app.start();

  assert.equal(runAllCount, 1);
  assert.equal(scheduledExpression, '*/3 * * * *');
  assert.deepEqual(task, {
    expression: '*/3 * * * *',
    callback: scheduledCallback,
  });
});
