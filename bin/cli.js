const { runCli } = require('../src/cli');

runCli().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
