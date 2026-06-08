const z = require('zod');

const { TAG_INPUT, STATUS_QUERY } = require('../shared/schemas');

// clear_tasks 虽然不接收业务参数，但 SDK 注册 tool 时仍然需要一个对象 schema。
const EMPTY_INPUT = z.object({});

function createToolDefinitions({ taskManager }) {
  // 这里故意只做一层很薄的适配：
  // 1. 面向 SDK 的信息放这里：tool 名称、描述、输入 schema、MCP 返回结构
  // 2. 真正的业务行为继续留在 taskManager，确保 REST 和 MCP 共用同一套规则
  return [
    {
      name: 'create_task',
      description: '为指定 Git tag 创建流水线监听任务。创建后 serve 模式的后台轮询会自动接管',
      inputSchema: TAG_INPUT,
      handler: async ({ tag }) => {
        try {
          // tag 合法性、重复检查等规则仍然交给 taskManager。
          // 这样 MCP 暴露出来的行为就和 REST 保持一致，不会长出第二套校验逻辑。
          const filePath = await taskManager.createTask({ tagName: tag });
          return {
            // 统一返回 text content，通用 MCP 客户端不需要再理解自定义 structuredContent
            // 就能直接展示结果。
            content: [{ type: 'text', text: JSON.stringify({ tag, filePath, created: true }) }],
          };
        } catch (error) {
          return {
            // 业务失败走 tool 级错误返回，而不是直接抛 transport/protocol 异常。
            // 客户端会把它看成一次正常完成的 tool 调用，只是 isError=true。
            content: [{ type: 'text', text: error.message }],
            isError: true,
          };
        }
      },
    },
    {
      name: 'list_tasks',
      description: '列出所有监听任务。可按状态过滤：pending（待处理）、processing（处理中）、archive（已归档）',
      inputSchema: STATUS_QUERY,
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
      inputSchema: TAG_INPUT,
      handler: async ({ tag }) => {
        try {
          const task = await taskManager.getTask({ tagName: tag });

          if (!task) {
            return {
              // “没找到任务”属于业务结果，不属于协议层异常，
              // 因此仍然按 tool 结果返回，只是标记 isError=true。
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
      inputSchema: TAG_INPUT,
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
      inputSchema: EMPTY_INPUT,
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

module.exports = {
  createToolDefinitions,
};
