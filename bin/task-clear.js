const { clearUnfinishedTasks } = require('../src/task/clear');

clearUnfinishedTasks()
  .then((count) => {
    process.stdout.write(`Cleared unfinished tasks: ${count}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
