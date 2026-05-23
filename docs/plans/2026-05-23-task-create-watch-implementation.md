# Task Create Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task creation optionally start the watcher immediately, with interactive confirmation and direct CLI `--watch` / `--no-watch` support.

**Architecture:** Keep behavior assembly in `src/cli.js`, where task creation already happens, and reuse the existing watcher startup entry instead of adding a second runtime path. Drive the change with CLI-focused tests first so prompt flow, default behavior, and startup wiring stay explicit.

**Tech Stack:** Node.js CommonJS, `cac`, `inquirer`, `node:test`

---

### Task 1: Add failing CLI coverage for watch selection

**Files:**
- Modify: `test/cli.test.js`
- Reference: `src/cli.js`

- [ ] **Step 1: Write the failing tests**

Add tests that require all of the following behaviors:

```js
test('runCli starts the watcher by default for direct task creation', async () => {
  const started = [];

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create', '--', 'release/1.2.3'],
    createTask: async () => '/tmp/release%2F1.2.3.md',
    startWatcher: async () => {
      started.push('started');
    },
    stdout: { write() {} },
  });

  assert.deepEqual(started, ['started']);
});

test('runCli skips watcher startup when --no-watch is passed', async () => {
  const started = [];

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create', '--', 'release/1.2.3', '--no-watch'],
    createTask: async () => '/tmp/release%2F1.2.3.md',
    startWatcher: async () => {
      started.push('started');
    },
    stdout: { write() {} },
  });

  assert.deepEqual(started, []);
});
```

Add one prompt-focused test that verifies `createPrompt()` asks both `tagName` and `watch`, and that the watch question uses the English message `Start listening now?`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL because `runCli()` does not yet support `watch`, `--no-watch`, or watcher startup injection.

### Task 2: Implement watch-aware task creation flow

**Files:**
- Modify: `src/cli.js`
- Reference: `src/index.js`

- [ ] **Step 1: Write minimal implementation**

Update `src/cli.js` so task creation resolves both `tagName` and `watch`, then conditionally starts the watcher:

```js
const { createApp } = require('./index');

async function runCli({
  argv = process.argv,
  createTask = createTaskFile,
  prompt = createPrompt(),
  startWatcher = () => createApp().start(),
  stdout = process.stdout,
} = {}) {
  // parse command and options
}

async function handleCreate({ tagName, watch, createTask, prompt, startWatcher, stdout }) {
  const answers = tagName ? { tagName, watch } : await prompt();
  const filePath = await createTask({ tagName: answers.tagName });

  stdout.write(`Created task file: ${filePath}\n`);

  if (answers.watch) {
    await startWatcher();
  }
}
```

Extend `createPrompt()` with a confirm question:

```js
{
  type: 'confirm',
  name: 'watch',
  message: 'Start listening now?',
  default: true,
}
```

Add a short boolean CLI option so direct usage supports `--watch` and `--no-watch`, with omitted value defaulting to `true`.

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS for the new CLI coverage and the existing suite.

### Task 3: Update user-facing command documentation

**Files:**
- Modify: `README.md`
- Test: `test/cli.test.js`

- [ ] **Step 1: Update command examples and notes**

Document these examples and rules:

```bash
pnpm task:create
pnpm task:create -- release/1.2.3
pnpm task:create -- release/1.2.3 --no-watch
```

Describe:

1. interactive mode asks `Input tag:` and `Start listening now?`
2. immediate watcher startup is the default
3. `--no-watch` disables startup for direct CLI usage

- [ ] **Step 2: Re-run tests**

Run: `pnpm test`
Expected: PASS with the CLI behavior still green after the README update.
