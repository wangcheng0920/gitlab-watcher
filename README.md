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
pnpm test
pnpm test:notify
```

说明：

1. `pnpm start`：启动当前 watcher 入口
2. `pnpm test`：运行现有测试
3. `pnpm test:notify`：手动触发一次本地提醒检查；在 macOS 下应弹出需要手动关闭的 alert

## 任务列表

- [x] 基于 cron 表达式的轮询触发机制
- [x] 文件系统维护监听任务状态
- [x] 设备适配器优先的通知层设计
- [x] Mac 使用 `osascript` 的 `display alert` 实现阻塞式提醒
- [ ] Windows 系统提醒适配
- [ ] 多项目监听支持、项目配置管理


