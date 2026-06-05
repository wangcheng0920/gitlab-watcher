const { cac } = require('cac');
const inquirer = require('inquirer');

const { createApp } = require('./index');
const { createTaskFile } = require('./task-create');

async function runCli({
  argv = process.argv,
  createTask = createTaskFile,
  prompt = createPrompt(),
  startWatcher = () => createApp().start(),
  stdout = process.stdout,
} = {}) {
  const cli = cac('gitlab-watcher');
  let commandResult = Promise.resolve();

  cli
    .command('task [action] [tagName]', 'Manage watch tasks')
    .option('--watch', 'Start listening now')
    .option('--no-watch', 'Create the task without starting the watcher')
    .action((action, tagName, options) => {
    commandResult = handleTaskCommand({
      action,
      tagName,
      watch: resolveWatchOption(options.watch),
      createTask,
      prompt,
      startWatcher,
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
    {
      type: 'confirm',
      name: 'watch',
      message: 'Start listening now?',
      default: true,
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

function resolveWatchOption(watch) {
  if (typeof watch === 'boolean') {
    return watch;
  }

  return true;
}

async function handleCreate({
  tagName,
  watch,
  createTask,
  prompt,
  startWatcher,
  stdout,
}) {
  const answers = tagName
    ? { tagName, watch: resolveWatchOption(watch) }
    : {
      watch: true,
      ...(await prompt()),
    };
  const filePath = await createTask({ tagName: answers.tagName });

  stdout.write(`Created task file: ${filePath}\n`);

  if (answers.watch) {
    const watcherResult = await startWatcher();

    if (watcherResult?.result?.status === 'already_running') {
      stdout.write('task created, watcher already running\n');
    }
  }
}

async function handleTaskCommand({
  action,
  tagName,
  watch,
  createTask,
  prompt,
  startWatcher,
  stdout,
}) {
  if (action === 'create') {
    await handleCreate({
      tagName,
      watch,
      createTask,
      prompt,
      startWatcher,
      stdout,
    });
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
