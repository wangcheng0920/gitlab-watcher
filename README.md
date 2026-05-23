# gitlab-watcher

用于监听指定 GitLab 项目下、指定 tag 关联流水线状态，并在流水线结束后发送本地提醒。

当前项目仍处于逐步完善阶段，目标先聚焦在**单实例、单项目、指定 tag** 的本地监听，不扩展到多项目、多任务或服务端部署场景。

## 当前已确认方案

1. 轮询触发基于用户提供的 cron 表达式
2. 当前按文件系统维护监听任务状态，不引入数据库
3. 通知层采用“设备适配器优先 + `node-notifier` 兜底”策略
4. macOS 当前优先使用 `osascript` 的 `display alert` 作为阻塞式提醒
5. Node.js 依赖管理统一使用 `pnpm`

## 相关文档

1. `docs/plans/2026-05-20-gitlab-tag-watcher-design.md`：技术设计与架构说明
2. `docs/rules/business-rules.md`：业务边界与通知规则
3. `docs/specs/watch-task-state.md`：监听任务状态与文件结构定义
4. `AGENTS.md`：仓库协作上下文与当前约束

## 常用命令

```bash
pnpm start
pnpm task:create
pnpm task:create -- release/1.2.3
pnpm task:create -- release/1.2.3 --no-watch
pnpm task:clear
pnpm test
pnpm test:notify
```

## 典型使用流程

```bash
# 交互式创建任务，并按提示决定是否立即开始监听
pnpm task:create

# 直接创建任务并立即开始监听（默认行为）
pnpm task:create -- release/1.2.3

# 只创建任务，稍后再手动启动 watcher
pnpm task:create -- release/1.2.3 --no-watch
pnpm start
```

说明：

1. `pnpm start`：启动当前 watcher 入口
2. `pnpm task:create`：交互式创建一个新的监听任务，会依次提示输入 tag 和是否立即开始监听
3. `pnpm task:create -- <tag>`：直接用指定 tag 创建任务，并默认立即启动 watcher，例如 `pnpm task:create -- release/1.2.3`
4. `pnpm task:create -- <tag> --no-watch`：只创建任务，不立即启动 watcher
5. `pnpm task:clear`：清空未完结任务，只删除 `tasks/pending/` 和 `tasks/processing/` 下的 `.md` 文件
6. `pnpm test`：运行现有测试
7. `pnpm test:notify`：手动触发一次本地提醒检查；在 macOS 下应弹出需要手动关闭的 alert

补充约定：

1. 交互模式会先显示 `Input tag:`，再显示 `Start listening now?`
2. tag 可以直接使用原始值，例如 `release/1.2.3`，不需要手动转换为文件名
3. 创建成功后会输出对应任务文件路径
4. 直接传参时默认立即开始监听；如只想创建任务可追加 `--no-watch`
5. 推荐通过 `pnpm task:create -- <tag>` 传入 tag，避免参数被 `pnpm` 本身解析
6. 如果同一 tag 已存在于 `tasks/pending/`、`tasks/processing/` 或 `tasks/archive/*/`，命令会直接报错
7. `pnpm task:clear` 不会删除 `tasks/archive/` 下的归档历史，也不会清理非 `.md` 文件

## 任务列表

- [x] 基于 cron 表达式的轮询触发机制
- [x] 文件系统维护监听任务状态
- [x] 设备适配器优先的通知层设计
- [x] Mac 使用 `osascript` 的 `display alert` 实现阻塞式提醒
- [x] 通过命令行创建监听任务，支持交互式输入、直接传参与创建后立即开始监听
- [x] 通过独立脚本清空未完结任务，保留 archive 历史
- [ ] Windows 系统提醒适配
- [ ] 多项目监听支持、项目配置管理
