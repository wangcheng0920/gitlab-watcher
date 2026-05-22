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
    prompt: async () => {
      promptCount += 1;
      return { tagName: 'should-not-be-used' };
    },
    stdout: { write() {} },
  });

  assert.deepEqual(createdTags, ['release/1.2.3']);
  assert.equal(promptCount, 0);
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
        return { tagName: 'release/1.2.3' };
      },
    },
  });

  const answers = await prompt();

  assert.deepEqual(answers, { tagName: 'release/1.2.3' });
  assert.equal(receivedQuestions[0].name, 'tagName');
});
