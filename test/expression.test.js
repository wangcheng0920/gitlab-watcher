const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_CRON_EXPRESSION,
  resolveCronExpression,
} = require('../src/expression');

test('resolveCronExpression returns the default three-minute schedule when config omits the value', () => {
  assert.equal(resolveCronExpression({}), DEFAULT_CRON_EXPRESSION);
  assert.equal(DEFAULT_CRON_EXPRESSION, '*/3 * * * *');
});

test('resolveCronExpression returns the configured cron expression when one is provided', () => {
  assert.equal(resolveCronExpression({ cronExpression: '0 * * * *' }), '0 * * * *');
});
