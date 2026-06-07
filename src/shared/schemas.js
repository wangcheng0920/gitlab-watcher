const z = require('zod');

const tagField = z.string().describe('Git tag 名称，如 release/1.0.0、1.0.0.1、1.0.0_xxx_1 等，格式多样');

const TAG_INPUT = z.object({
  tag: tagField,
});

const TAG_QUERY = z.object({
  tag: tagField,
});

const STATUS_QUERY = z.object({
  status: z.enum(['pending', 'processing', 'archive']).optional()
    .describe('按状态过滤：pending / processing / archive'),
});

module.exports = {
  TAG_INPUT,
  TAG_QUERY,
  STATUS_QUERY,
};
