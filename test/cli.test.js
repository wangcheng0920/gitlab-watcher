const test = require('node:test');
const assert = require('node:assert/strict');

let runCli;
let createPrompt;

try {
  ({ runCli, createPrompt } = require('../src/cli'));
} catch {
  runCli = undefined;
  createPrompt = undefined;
}

test('runCli passes the provided tag to task creation without prompting', async () => {
  const createdTags = [];
  let promptCount = 0;

  assert.equal(typeof runCli, 'function');

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create', 'release/1.2.3'],
    createTask: async ({ tagName }) => {
      createdTags.push(tagName);

      return '/tmp/release%2F1.2.3.md';
    },
    startWatcher: async () => {},
    prompt: async () => {
      promptCount += 1;
      return { tagName: 'should-not-be-used' };
    },
    stdout: { write() {} },
  });

  assert.deepEqual(createdTags, ['release/1.2.3']);
  assert.equal(promptCount, 0);
});

test('runCli prompts for the tag when task create is called without an argument', async () => {
  const createdTags = [];

  assert.equal(typeof runCli, 'function');

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create'],
    createTask: async ({ tagName }) => {
      createdTags.push(tagName);

      return '/tmp/release%2F1.2.3.md';
    },
    startWatcher: async () => {},
    prompt: async () => ({ tagName: 'release/1.2.3' }),
    stdout: { write() {} },
  });

  assert.deepEqual(createdTags, ['release/1.2.3']);
});

test('runCli accepts pnpm-forwarded tag arguments after -- without prompting', async () => {
  const createdTags = [];
  let promptCount = 0;

  assert.equal(typeof runCli, 'function');

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create', '--', 'release/1.2.3'],
    createTask: async ({ tagName }) => {
      createdTags.push(tagName);

      return '/tmp/release%2F1.2.3.md';
    },
    startWatcher: async () => {},
    prompt: async () => {
      promptCount += 1;
      return { tagName: 'should-not-be-used' };
    },
    stdout: { write() {} },
  });

  assert.deepEqual(createdTags, ['release/1.2.3']);
  assert.equal(promptCount, 0);
});

test('runCli starts the watcher by default when task create receives a tag directly', async () => {
  const started = [];
  let promptCount = 0;

  assert.equal(typeof runCli, 'function');

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create', 'release/1.2.3'],
    createTask: async () => '/tmp/release%2F1.2.3.md',
    startWatcher: async () => {
      started.push('started');
    },
    prompt: async () => {
      promptCount += 1;
      return { tagName: 'should-not-be-used', watch: false };
    },
    stdout: { write() {} },
  });

  assert.deepEqual(started, ['started']);
  assert.equal(promptCount, 0);
});

test('runCli reuses the running watcher and prints a message when task create starts no new watcher', async () => {
  const writes = [];

  assert.equal(typeof runCli, 'function');

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create', 'release/1.2.3'],
    createTask: async () => '/tmp/release%2F1.2.3.md',
    startWatcher: async () => ({ status: 'already_running' }),
    stdout: {
      write(message) {
        writes.push(message);
      },
    },
  });

  assert.deepEqual(writes, [
    'Created task file: /tmp/release%2F1.2.3.md\n',
    'task created, watcher already running\n',
  ]);
});

test('runCli skips watcher startup when task create receives --no-watch', async () => {
  const started = [];

  assert.equal(typeof runCli, 'function');

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

test('runCli starts the watcher when interactive task create confirms watch', async () => {
  const started = [];

  assert.equal(typeof runCli, 'function');

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create'],
    createTask: async () => '/tmp/release%2F1.2.3.md',
    startWatcher: async () => {
      started.push('started');
    },
    prompt: async () => ({ tagName: 'release/1.2.3', watch: true }),
    stdout: { write() {} },
  });

  assert.deepEqual(started, ['started']);
});

test('runCli skips watcher startup when interactive task create declines watch', async () => {
  const started = [];

  assert.equal(typeof runCli, 'function');

  await runCli({
    argv: ['node', 'src/cli.js', 'task', 'create'],
    createTask: async () => '/tmp/release%2F1.2.3.md',
    startWatcher: async () => {
      started.push('started');
    },
    prompt: async () => ({ tagName: 'release/1.2.3', watch: false }),
    stdout: { write() {} },
  });

  assert.deepEqual(started, []);
});

test('runCli does not start the watcher when task creation fails', async () => {
  const started = [];

  assert.equal(typeof runCli, 'function');

  await assert.rejects(
    () => runCli({
      argv: ['node', 'src/cli.js', 'task', 'create', 'release/1.2.3'],
      createTask: async () => {
        throw new Error('task create failed');
      },
      startWatcher: async () => {
        started.push('started');
      },
      stdout: { write() {} },
    }),
    /task create failed/,
  );

  assert.deepEqual(started, []);
});

test('runCli rejects unsupported task actions such as clear', async () => {
  assert.equal(typeof runCli, 'function');

  await assert.rejects(
    () => runCli({
      argv: ['node', 'src/cli.js', 'task', 'clear'],
      stdout: { write() {} },
    }),
    /Unsupported task action "clear"\./,
  );
});

test('createPrompt uses the inquirer default export when present', async () => {
  let receivedQuestions;

  assert.equal(typeof createPrompt, 'function');

  const prompt = createPrompt({
    default: {
      async prompt(questions) {
        receivedQuestions = questions;
        return { tagName: 'release/1.2.3', watch: true };
      },
    },
  });

  const answers = await prompt();

  assert.deepEqual(answers, { tagName: 'release/1.2.3', watch: true });
  assert.equal(receivedQuestions[0].name, 'tagName');
  assert.equal(receivedQuestions[1].name, 'watch');
  assert.equal(receivedQuestions[1].message, 'Start listening now?');
  assert.equal(receivedQuestions[1].default, true);
});
