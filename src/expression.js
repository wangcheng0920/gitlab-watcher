const DEFAULT_CRON_EXPRESSION = '*/3 * * * *';

function resolveCronExpression(config = {}) {
  return config.cronExpression || DEFAULT_CRON_EXPRESSION;
}

module.exports = {
  DEFAULT_CRON_EXPRESSION,
  resolveCronExpression,
};
