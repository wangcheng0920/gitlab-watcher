const test = require('node:test');
const assert = require('node:assert/strict');

const { createNotifier, runOsascript } = require('../src/notify');

test('createNotifier uses osascript display alert on macOS', () => {
  const scripts = [];

  const notify = createNotifier({
    platform: 'darwin',
    osascriptRunner(script) {
      scripts.push(script);
    },
    notifier: {
      notify() {
        throw new Error('node-notifier should not be used on macOS');
      },
    },
  });

  notify({
    title: 'Pipeline finished',
    message: 'tag v1.0.0 completed successfully',
  });

  assert.deepEqual(scripts, [
    'display alert "Pipeline finished" message "tag v1.0.0 completed successfully"',
  ]);
});

test('createNotifier escapes macOS alert text before calling osascript', () => {
  const scripts = [];

  const notify = createNotifier({
    platform: 'darwin',
    osascriptRunner(script) {
      scripts.push(script);
    },
    notifier: {
      notify() {
        throw new Error('node-notifier should not be used on macOS');
      },
    },
  });

  notify({
    title: 'Pipeline "success"',
    message: 'Path C:\\builds\\release-1.2.3',
  });

  assert.deepEqual(scripts, [
    'display alert "Pipeline \\"success\\"" message "Path C:\\\\builds\\\\release-1.2.3"',
  ]);
});

test('createNotifier falls back to node-notifier outside macOS', () => {
  let receivedNotification;

  const notifier = {
    notify(options) {
      receivedNotification = options;
    },
  };

  const notify = createNotifier({
    platform: 'linux',
    notifier,
    osascriptRunner() {
      throw new Error('osascript should not be used outside macOS');
    },
  });

  notify({
    title: 'Pipeline finished',
    message: 'tag v1.0.0 completed successfully',
  });

  assert.deepEqual(receivedNotification, {
    title: 'Pipeline finished',
    message: 'tag v1.0.0 completed successfully',
  });
});

test('runOsascript starts a detached osascript process so the watcher process is not blocked', () => {
  let receivedCommand;
  let receivedArgs;
  let receivedOptions;
  let unrefCalled = 0;

  runOsascript('display alert "Pipeline finished" message "tag v1.0.0 completed successfully"', {
    spawn(command, args, options) {
      receivedCommand = command;
      receivedArgs = args;
      receivedOptions = options;

      return {
        unref() {
          unrefCalled += 1;
        },
      };
    },
  });

  assert.equal(receivedCommand, 'osascript');
  assert.deepEqual(receivedArgs, [
    '-e',
    'display alert "Pipeline finished" message "tag v1.0.0 completed successfully"',
  ]);
  assert.deepEqual(receivedOptions, {
    detached: true,
    stdio: 'ignore',
  });
  assert.equal(unrefCalled, 1);
});
