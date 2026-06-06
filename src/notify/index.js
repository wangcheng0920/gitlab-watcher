const { createNotifier, runOsascript } = require('./platform');
const { createFeishuNotifier, buildCard, computeSignature, formatLocalTime } = require('./feishu');

module.exports = {
  createNotifier,
  runOsascript,
  createFeishuNotifier,
  buildCard,
  computeSignature,
  formatLocalTime,
};
