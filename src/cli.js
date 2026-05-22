const { cac } = require('cac');
const inquirer = require('inquirer');

const { createTaskFile } = require('./task-create');

async function runCli({
  argv = process.argv,
  createTask = createTaskFile,
  prompt = createPrompt(),
  stdout = process.stdout,
} = {}) {
  const cli = cac('gitlab-watcher');
  let commandResult = Promise.resolve();

  cli.command('task [action] [tagName]', 'Manage watch tasks').action((action, tagName) => {
    commandResult = handleTaskCommand({
      action,
      tagName,
      createTask,
      prompt,
      stdout,
    });
    return commandResult;
  });

  cli.help();
  cli.parse(normalizeArgv(argv));

  await commandResult;
}

function createPrompt(inquirerModule = inquirer) {
  const promptModule = resolvePromptModule(inquirerModule);

  return async () => promptModule.prompt([
    {
      type: 'input',
      name: 'tagName',
      message: 'Input tag:',
      filter(value) {
        return value.trim();
      },
      validate(value) {
        return value.trim() ? true : 'Tag is required.';
      },
    },
  ]);
}

function resolvePromptModule(inquirerModule) {
  if (typeof inquirerModule?.prompt === 'function') {
    return inquirerModule;
  }

  if (typeof inquirerModule?.default?.prompt === 'function') {
    return inquirerModule.default;
  }

  throw new Error('Inquirer prompt is unavailable.');
}

function normalizeArgv(argv) {
  const separatorIndex = argv.indexOf('--');

  if (separatorIndex === -1) {
    return argv;
  }

  return [
    ...argv.slice(0, separatorIndex),
    ...argv.slice(separatorIndex + 1),
  ];
}

async function handleCreate({ tagName, createTask, prompt, stdout }) {
  const nextTagName = tagName || (await prompt()).tagName;
  const filePath = await createTask({ tagName: nextTagName });

  stdout.write(`Created task file: ${filePath}\n`);
}

async function handleTaskCommand({ action, tagName, createTask, prompt, stdout }) {
  if (action === 'create') {
    await handleCreate({ tagName, createTask, prompt, stdout });
    return;
  }

  throw new Error(`Unsupported task action "${action}".`);
}

if (require.main === module) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  createPrompt,
  runCli,
};
