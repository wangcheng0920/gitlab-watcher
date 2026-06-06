const { createApp } = require('../src/app');

createApp().start().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
