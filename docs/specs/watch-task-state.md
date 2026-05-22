# 监听任务状态定义

## 文档目的

本文件用于定义“监听任务”在当前阶段的文件落地结构、状态枚举和状态流转规则，供后续 AI 在实现状态层、缓存层或轮询逻辑时参考。

本文件回答的是“任务文件放在哪里、文件里记录什么、状态有哪些、状态如何变化”；业务约束本身仍以 `docs/rules/business-rules.md` 为准。

## 适用范围

当前定义仅适用于以下场景：

1. 单实例
2. 单项目
3. 单 tag
4. 单条监听任务

如果后续扩展为多监听任务，不应直接修改当前字段语义，而应在新增需求确认后再扩展结构。

## 目录结构定义

当前阶段不使用数据库，也不使用 `current.json` 之类的聚合状态文件。

监听任务按以下目录结构落地：

```text
tasks/
  pending/
    <tag>.md
  processing/
    <tag>.md
  archive/
    success/
      <tag>.md
    failed/
      <tag>.md
    canceled/
      <tag>.md
```

含义如下：

1. `pending/<tag>.md`：待处理任务文件。创建时允许为空文件。
2. `processing/<tag>.md`：正在监听中的任务文件。每次查询结果都写入该文件。
3. `archive/<status>/<tag>.md`：已完成归档文件，仅在终态通知后写入。

程序启动后，`pending/` 和 `processing/` 都应被视为未完结任务来源：

1. `pending/` 中的文件在首次被接管时，需要先移动到 `processing/`。
2. `processing/` 中的文件表示任务已经开始，启动恢复时应直接继续处理。

当前范围接受以下约束：

1. 一个 tag 只处理一次。
2. 归档文件保持原文件名，不增加时间前缀。
3. `processing/` 下不再按状态拆分子目录。

## 未完结任务清理

当前实现已支持手动清理未完结任务，用于本地重置监听队列。

规则如下：

1. 清理范围仅限 `tasks/pending/` 和 `tasks/processing/` 下的 `.md` 任务文件。
2. `tasks/archive/` 下的已归档任务文件不参与清理。
3. 非 `.md` 文件不参与清理。
4. 当前入口为独立脚本 `pnpm task:clear`，底层执行 `node src/task-clear.js`。

该能力的语义是“清空当前未完结监听任务”，不是“删除全部任务历史”。

## 任务文件内容定义

任务文件采用纯文本追加方式记录查询历史。

每次查询都应在文件顶部追加一段最新记录，形成时间倒序，例如：

```text
---
queryTime: 2026-05-21T14:25:00.000Z
status: success
pipelineId: 102938

---
queryTime: 2026-05-21T14:20:00.000Z
status: running
pipelineId: 102938

---
queryTime: 2026-05-21T14:15:00.000Z
status: not_found
```

当前建议每段至少支持以下字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `queryTime` | `string` | 本次查询时间，建议使用 ISO 时间字符串 |
| `status` | `string` | 本次查询得到的状态枚举值 |
| `pipelineId` | `string` | 本次关联到的流水线 ID；未找到时可省略 |

其中 `pipelineId` 不是强制每次都有，但只要已经找到目标流水线，后续记录都建议持续写入。

## 监听任务状态枚举

当前建议监听任务仅使用以下六个状态：

### 1. `not_found`

表示本次查询成功执行，但尚未找到目标 tag 关联的目标流水线。

该状态仅应出现在 `processing/` 中。

### 2. `running`

表示已经找到目标流水线，并且该流水线仍处于非终态。

GitLab 的 `created`、`pending`、`preparing`、`running`、`scheduled` 等中间态，在当前阶段统一折叠为 `running`。

该状态仅应出现在 `processing/` 中。

### 3. `query_error`

表示本次查询异常，例如网络错误、鉴权失败或接口异常。

该状态表示“这一轮查询失败”，不表示任务失败，也不表示流水线失败。

该状态仅应出现在 `processing/` 中。

### 4. `success`

表示目标流水线成功结束。

在当前方案下，通知完成后文件应被移动到 `archive/success/`。

### 5. `failed`

表示目标流水线失败结束。

在当前方案下，通知完成后文件应被移动到 `archive/failed/`。

### 6. `canceled`

表示目标流水线取消结束。

在当前方案下，通知完成后文件应被移动到 `archive/canceled/`。

## 状态流转规则

当前建议的状态流转关系如下：

`pending/空文件 -> processing/not_found -> processing/running -> archive/success|failed|canceled`

同时允许以下处理中流转：

1. `processing/not_found -> processing/query_error`
2. `processing/query_error -> processing/not_found`
3. `processing/running -> processing/query_error`
4. `processing/query_error -> processing/running`
5. `processing/not_found -> processing/running`

当前不建议允许以下流转：

1. 已归档文件重新回到 `processing/`
2. 已归档文件重新回到 `pending/`
3. `query_error` 直接归档为终态

原因是当前第一版模型按“一次创建、一次完成、一次归档”理解，且用户已接受同一个 tag 只处理一次。

## 各状态的维护建议

### `pending`

通过 `pending/<tag>.md` 表达，不需要在文件内容中额外写 `status`。

当前阶段允许它就是一个空文件。

程序启动或定时扫描时，只要该文件被正式接管，就应迁移到 `processing/`。

### `not_found`

当任务被移动到 `processing/` 后，如果本次查询成功但尚未找到目标流水线，则在文件顶部追加一段 `status: not_found` 记录。

### `running`

当任务已经定位到目标流水线，且其仍处于非终态时，在文件顶部追加一段 `status: running` 记录。

如果能够获得 `pipelineId`，建议从首次发现开始持续写入。

### `query_error`

当本次查询异常时，在文件顶部追加一段 `status: query_error` 记录。

该记录写入后，文件仍保留在 `processing/`，等待下一次 cron 继续处理。

### `success` / `failed` / `canceled`

当目标流水线首次进入终态且通知成功后，在文件顶部追加终态记录，然后把文件移动到对应的归档目录。

终态一旦归档，不再继续参与轮询。

## 与业务规则的关系

本文件只定义落地结构和状态本身，不替代业务规则。

例如：

1. “只允许首次终态通知一次”属于业务规则，应看 `docs/rules/business-rules.md`
2. “通知后将任务文件移动到 `archive/<status>/`”属于结构和状态定义，应看本文件

如果两份文档同时涉及同一概念，应理解为：

1. `rules` 负责定义业务语义
2. `specs` 负责定义数据落地方式

## 示例文件

归档前的 `processing/5.2.13.41.md` 可形如：

```text
---
queryTime: 2026-05-21T14:25:00.000Z
status: running
pipelineId: 102938

---
queryTime: 2026-05-21T14:20:00.000Z
status: not_found
```

归档后的 `archive/success/5.2.13.41.md` 可形如：

```text
---
queryTime: 2026-05-21T14:30:00.000Z
status: success
pipelineId: 102938

---
queryTime: 2026-05-21T14:25:00.000Z
status: running
pipelineId: 102938

---
queryTime: 2026-05-21T14:20:00.000Z
status: not_found
```
