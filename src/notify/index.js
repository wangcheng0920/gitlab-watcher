const { createNotifier, runOsascript } = require('./platform');
const { createFeishuNotifier, buildCard, buildTextContent, computeSignature, formatLocalTime } = require('./feishu');

module.exports = {
  createNotifier,
  runOsascript,
  createFeishuNotifier,
  buildCard,
  buildTextContent,
  computeSignature,
  formatLocalTime,
};
