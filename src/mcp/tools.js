const { TAG_INPUT, STATUS_QUERY } = require('../shared/schemas');

const EMPTY_JSON_SCHEMA = {
  type: 'object',
  properties: {},
};

function createToolDefinitions({ taskManager }) {
  return [
    {
      name: 'create_task',
      description: '为指定 Git tag 创建流水线监听任务。创建后 serve 模式的后台轮询会自动接管',
      inputSchema: zodToJsonSchema(TAG_INPUT),
      handler: async ({ tag }) => {
        try {
          const filePath = await taskManager.createTask({ tagName: tag });
          return {
            content: [{ type: 'text', text: JSON.stringify({ tag, filePath, created: true }) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          };
        }
      },
    },
    {
      name: 'list_tasks',
      description: '列出所有监听任务。可按状态过滤：pending（待处理）、processing（处理中）、archive（已归档）',
      inputSchema: zodToJsonSchema(STATUS_QUERY),
      handler: async ({ status }) => {
        try {
          const tasks = await taskManager.listTasks({ status: status || undefined });
          return {
            content: [{ type: 'text', text: JSON.stringify({ tasks }) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          };
        }
      },
    },
    {
      name: 'get_task',
      description: '获取指定 tag 的监听任务详情，包含最新轮询记录',
      inputSchema: zodToJsonSchema(TAG_INPUT),
      handler: async ({ tag }) => {
        try {
          const task = await taskManager.getTask({ tagName: tag });

          if (!task) {
            return {
              content: [{ type: 'text', text: `Task not found for tag "${tag}".` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(task) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          };
        }
      },
    },
    {
      name: 'delete_task',
      description: '删除指定 tag 的监听任务（从任意状态目录中移除）',
      inputSchema: zodToJsonSchema(TAG_INPUT),
      handler: async ({ tag }) => {
        try {
          const deleted = await taskManager.deleteTask({ tagName: tag });

          if (!deleted) {
            return {
              content: [{ type: 'text', text: `Task not found for tag "${tag}".` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify({ tag, deleted: true }) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          };
        }
      },
    },
    {
      name: 'clear_tasks',
      description: '清理所有未完结任务（pending + processing 目录下的 .md 任务文件），不影响已归档任务',
      inputSchema: EMPTY_JSON_SCHEMA,
      handler: async () => {
        try {
          const deletedCount = await taskManager.clearUnfinishedTasks();
          return {
            content: [{ type: 'text', text: JSON.stringify({ deletedCount }) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          };
        }
      },
    },
  ];
}

function zodToJsonSchema(zodSchema) {
  const jsonSchema = { type: 'object', properties: {}, required: [] };
  const shape = zodSchema._zod?.def?.shape || {};

  for (const [key, field] of Object.entries(shape)) {
    const def = field._zod?.def || {};
    const typeName = def.type;
    let resolved = field;
    let isOptional = false;

    if (typeName === 'optional') {
      isOptional = true;
      resolved = def.innerType;
    }

    const rtype = resolved._zod?.def?.type;

    if (rtype === 'string') {
      jsonSchema.properties[key] = { type: 'string' };
    } else if (rtype === 'enum') {
      const options = Array.isArray(resolved.options) ? resolved.options : Object.values(resolved.enum || resolved._zod?.def?.entries || {});
      jsonSchema.properties[key] = { type: 'string', enum: options };
    }

    if (!isOptional) {
      jsonSchema.required.push(key);
    }

    const desc = field.description || resolved._zod?.def?.description;
    if (desc) {
      jsonSchema.properties[key].description = desc;
    }
  }

  if (jsonSchema.required.length === 0) {
    delete jsonSchema.required;
  }

  return jsonSchema;
}

module.exports = {
  createToolDefinitions,
};
