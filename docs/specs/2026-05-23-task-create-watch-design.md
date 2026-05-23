# Task Create Auto-Start Watch Design

**Goal:** Let task creation optionally start the watcher immediately, with auto-start enabled by default for both interactive and direct CLI usage.

## Context

Today `pnpm task:create` only creates a task file. The user must manually run `pnpm start` afterward to begin listening. This creates an extra step between task creation and actual monitoring.

The repository already has:

1. a task creation CLI in `src/cli.js`
2. task file creation in `src/task-create.js`
3. a watcher startup entry in `src/index.js`

This change should connect those existing pieces without changing the task file structure or watcher state model.

## Scope

This design only covers the task creation flow.

Included:

1. interactive prompt changes for task creation
2. direct CLI parameter support for watch start behavior
3. wiring task creation to the existing watcher startup flow
4. tests and README updates for the new behavior

Excluded:

1. watcher runtime logic changes
2. task file format changes
3. multi-task process management
4. background daemonization or detached execution

## Options Considered

### Option A: Short watch flag plus interactive confirmation (recommended)

Add a short boolean CLI option for direct invocation and ask the same choice during interactive task creation.

Behavior:

1. interactive mode asks `Input tag:` and then `Start listening now?`
2. the confirmation defaults to `true`
3. direct CLI uses `--watch` / `--no-watch`
4. omitted direct option defaults to `watch = true`

Why this is recommended:

1. it keeps direct CLI usage short
2. it gives interactive users the same control instead of hiding the behavior behind an implicit default
3. it keeps prompt copy in English and aligned with the existing CLI wording

### Option B: Long descriptive flag only

Use a long option such as `--start-listening` and avoid adding an interactive question.

This is clear but too verbose for frequent use and does not match the requested UX preference for a shorter parameter.

### Option C: Separate create and create-and-watch commands

Expose two commands instead of a boolean option.

This would work, but it spreads one behavior across multiple entrypoints and makes the CLI harder to remember.

## Approved UX

### Interactive flow

`pnpm task:create`

Prompt sequence:

1. `Input tag:`
2. `Start listening now?`

Rules:

1. the second prompt is in English
2. the second prompt defaults to `true`
3. if the user confirms, the command creates the task and then starts the watcher in the same process
4. if the user declines, the command only creates the task

### Direct CLI flow

Examples:

```bash
pnpm task:create -- release/1.2.3
pnpm task:create -- release/1.2.3 --no-watch
```

Rules:

1. when no explicit watch flag is passed, direct CLI defaults to `watch = true`
2. `--no-watch` disables immediate watcher startup
3. `--watch` may be accepted explicitly, but the important behavior is support for `--no-watch`

## Runtime Behavior

The task file is still created first.

Flow:

1. resolve `tagName` and `watch` from CLI arguments or prompts
2. call the existing task creation logic
3. write `Created task file: <path>`
4. if `watch === false`, exit normally
5. if `watch === true`, start the existing watcher app in the current process

This keeps the current file-based task model intact:

1. task creation still writes into `tasks/pending/`
2. watcher startup still owns the transition from `pending/` to `processing/`
3. no special task file metadata is needed for the auto-start case

## Failure Handling

If task creation fails:

1. do not start the watcher
2. surface the existing creation error

If watcher startup fails after task creation succeeds:

1. do not delete or roll back the created task file
2. surface the startup error to the CLI
3. allow the user to run the watcher again later and resume from the existing pending task

This preserves the repository's current file-driven recovery model.

## Documentation Boundary

This document only defines behavior, UX, runtime semantics, and acceptance criteria.

Implementation steps, touched files, and test execution details should live in:

`docs/plans/2026-05-23-task-create-watch-implementation.md`

## Acceptance Criteria

This design is complete when all of the following are true:

1. creating a task can immediately start the watcher in the same command
2. interactive mode explicitly asks whether to start listening now
3. direct CLI usage supports disabling startup with a short option
4. all new prompt copy is in English
5. existing watcher processing and task storage behavior remain unchanged
