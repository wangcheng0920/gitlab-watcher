const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_POLL_INTERVAL_MINUTES,
  resolvePollIntervalMinutes,
} = require('../src/expression');

test('resolvePollIntervalMinutes returns the default three-minute interval when config omits the value', () => {
  assert.equal(resolvePollIntervalMinutes({}), DEFAULT_POLL_INTERVAL_MINUTES);
  assert.equal(DEFAULT_POLL_INTERVAL_MINUTES, 3);
});

test('resolvePollIntervalMinutes returns the configured numeric value when one is provided', () => {
  assert.equal(resolvePollIntervalMinutes({ pollIntervalMinutes: 5 }), 5);
});

test('resolvePollIntervalMinutes throws for invalid values', () => {
  for (const pollIntervalMinutes of [0, -1, '3']) {
    assert.throws(
      () => resolvePollIntervalMinutes({ pollIntervalMinutes }),
      /pollIntervalMinutes/i,
    );
  }
});

test('resolvePollIntervalMinutes throws for non-finite or overflow values', () => {
  const overflowMinutes = (2_147_483_647 / 60_000) + 1;

  for (const pollIntervalMinutes of [Infinity, overflowMinutes]) {
    assert.throws(
      () => resolvePollIntervalMinutes({ pollIntervalMinutes }),
      /pollIntervalMinutes/i,
    );
  }
});
