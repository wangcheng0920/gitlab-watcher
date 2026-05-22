# Startup Entry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a runnable startup entry that schedules work with a cron expression, defaulting to every three minutes, while keeping expression, request, and notification logic in separate modules.

**Architecture:** Keep runtime wiring in `src/index.js` and isolate the three requested responsibilities into `src/expression.js`, `src/request.js`, and `src/notify.js`. Use dependency injection in tests so the startup flow can be verified without real network or desktop side effects.

**Tech Stack:** Node.js CommonJS, `node:test`, `node-cron`, `axios`, `node-notifier`

---

### Task 1: Establish test harness and failing coverage

**Files:**
- Modify: `package.json`
- Create: `test/expression.test.js`
- Create: `test/request.test.js`
- Create: `test/notify.test.js`
- Create: `test/index.test.js`

**Step 1: Write the failing tests**

Add tests that require:
1. a default cron expression of `*/3 * * * *`
2. an overridable cron expression
3. a request wrapper that calls an injected HTTP client and returns response data
4. a notifier wrapper that forwards title and message
5. a startup entry that schedules cron and forwards request results to notifications

**Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL because `src/expression.js`, `src/request.js`, `src/notify.js`, and `src/index.js` do not exist yet.

### Task 2: Implement the minimal runtime modules

**Files:**
- Create: `src/expression.js`
- Create: `src/request.js`
- Create: `src/notify.js`
- Create: `src/index.js`

**Step 1: Write minimal implementation**

Add:
1. `resolveCronExpression()` with a default every-three-minute expression
2. `createRequestRunner()` wrapping `axios`
3. `createNotifier()` wrapping `node-notifier`
4. `createApp()` that schedules cron, runs the request function, and forwards the returned notification payload

**Step 2: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS for the new test suite.

### Task 3: Finish runtime entry and scripts

**Files:**
- Modify: `package.json`

**Step 1: Add runtime script**

Expose a `start` script that runs `node src/index.js`.

**Step 2: Re-run tests**

Run: `pnpm test`
Expected: PASS with the same suite still green.
