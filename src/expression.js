const DEFAULT_POLL_INTERVAL_MINUTES = 3;
const DEFAULT_CRON_EXPRESSION = '*/3 * * * *';
const MAX_TIMEOUT_MILLISECONDS = 2_147_483_647;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

function resolveCronExpression(config = {}) {
  return config.cronExpression || DEFAULT_CRON_EXPRESSION;
}

function resolvePollIntervalMinutes(config = {}) {
  const { pollIntervalMinutes } = config;

  if (pollIntervalMinutes === undefined) {
    return DEFAULT_POLL_INTERVAL_MINUTES;
  }

  if (
    typeof pollIntervalMinutes !== 'number'
    || !Number.isFinite(pollIntervalMinutes)
    || pollIntervalMinutes <= 0
    || (pollIntervalMinutes * MILLISECONDS_PER_MINUTE) > MAX_TIMEOUT_MILLISECONDS
  ) {
    throw new Error('pollIntervalMinutes must be a positive number within Node.js timer range');
  }

  return pollIntervalMinutes;
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MINUTES,
  DEFAULT_CRON_EXPRESSION,
  resolvePollIntervalMinutes,
  resolveCronExpression,
};
