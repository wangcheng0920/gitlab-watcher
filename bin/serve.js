const { startDaemon } = require('../src/daemon');

startDaemon().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
