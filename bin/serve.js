const { startDaemon } = require('../src/daemon');

// serve 入口保持为薄包装：
// 这里只负责把进程启动交给 daemon，并把启动失败打印到 stderr。
startDaemon().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
