import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../index.js";
import { pollSettings } from "../poll.js";
import { openStore } from "../store.js";

const env = { TELEGRAM_BOT_TOKEN: "101:fake-one", TELEGRAM_BOT_TOKEN_2: "202:fake-two" };
const update = { update_id: 1, message: { message_id: 1, date: 1,
  chat: { id: 7, type: "private" }, text: "Saved by background fetch" } };

async function dataDirectory(t) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-poll-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return dataDir;
}

test("Background fetch settings have plain defaults and bounded intervals", () => {
  for (const value of [undefined, "", "1", "true", "yes", " YES ", "on", "${TELEGRAM_POLL_ENABLED}"]) {
    assert.equal(pollSettings({ TELEGRAM_POLL_ENABLED: value }).enabled, true);
  }
  for (const value of ["0", "false", "no", "off", " OFF "]) {
    assert.equal(pollSettings({ TELEGRAM_POLL_ENABLED: value }).enabled, false);
  }
  assert.equal(pollSettings({}).intervalSec, 120);
  for (const [value, expected] of [["", 120], ["bad", 120], ["Infinity", 120], ["-10", 30], ["0", 30], ["5", 30], ["90", 90], ["120", 120], ["900", 600]]) {
    assert.equal(pollSettings({ TELEGRAM_POLL_INTERVAL_SEC: value }).intervalSec, expected);
  }
});

test("Background fetch starts by default for each bot and close clears the timer", async (t) => {
  const dataDir = await dataDirectory(t);
  const calls = [];
  let interval;
  let cleared;
  let tick;
  const timer = { unref() {} };
  t.mock.method(globalThis, "setInterval", (callback, ms) => { tick = callback; interval = ms; return timer; });
  t.mock.method(globalThis, "clearInterval", (value) => { cleared = value; });
  const server = createServer({ env: { ...env, TELEGRAM_POLL_INTERVAL_SEC: "90" }, dataDir,
    fetch: async (url) => {
      calls.push(url.includes("bot101:") ? "101" : "202");
      return Response.json({ ok: true, result: [update] });
    } });
  t.after(() => server.close());
  assert.equal(interval, 90000);
  await server.close();
  assert.equal(cleared, timer);
  assert.deepEqual(calls.sort(), ["101", "202"]);
  for (const id of [101, 202]) {
    const store = openStore(dataDir, id);
    const state = await store.read();
    assert.deepEqual(state.pending, [["7", 1]]);
    assert.equal(typeof state.last_poll_at, "number");
    assert.equal(typeof state.last_update_at, "number");
    assert.equal((await readFile(path.join(store.dir, "store.sqlite"))).subarray(0, 16).toString(), "SQLite format 3\0");
  }
  tick();
  assert.equal(calls.length, 2);
});

test("The environment and the test override can each disable automatic fetch", async (t) => {
  const dataDir = await dataDirectory(t);
  for (const options of [{ env: { ...env, TELEGRAM_POLL_ENABLED: "off" } }, { env, pollEnabled: false }]) {
    let calls = 0;
    const server = createServer({ ...options, dataDir, fetch: async () => {
      calls++;
      return Response.json({ ok: true, result: [] });
    } });
    await server.close();
    assert.equal(calls, 0);
  }
});

test("Overlapping cycles skip a bot and close waits for its active save", async (t) => {
  const dataDir = await dataDirectory(t);
  let release;
  let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const server = createServer({ env, dataDir, pollEnabled: false, fetch: async () => {
    started();
    await new Promise((resolve) => { release = resolve; });
    return Response.json({ ok: true, result: [update] });
  } });
  t.after(() => server.close());
  const first = server.pollOnce("101");
  await waiting;
  assert.deepEqual(await server.pollOnce("101"), [{ bot_id: "101", skipped: true }]);
  let closed = false;
  const closing = server.close().then(() => { closed = true; });
  assert.equal(closed, false);
  release();
  await first;
  await closing;
  assert.deepEqual((await openStore(dataDir, 101).read()).pending, [["7", 1]]);
  assert.deepEqual(await server.pollOnce("101"), [{ bot_id: "101", skipped: true }]);
});

test("A locked bot is skipped and a failed bot does not stop other bots", async (t) => {
  const dataDir = await dataDirectory(t);
  const logs = [];
  const calls = [];
  t.mock.method(console, "error", (message) => logs.push(message));
  const server = createServer({ env, dataDir, pollEnabled: false, fetch: async (url) => {
    const id = url.includes("bot101:") ? "101" : "202";
    calls.push(id);
    if (id === "101") throw new Error(`Fetch failed ${env.TELEGRAM_BOT_TOKEN_2}`);
    return Response.json({ ok: true, result: [update] });
  } });
  t.after(() => server.close());
  const lock = path.join(dataDir, "101/poll.lock");
  await mkdir(path.dirname(lock), { recursive: true });
  await writeFile(lock, "");
  assert.deepEqual(await server.pollOnce("101"), [{ bot_id: "101", skipped: true }]);
  assert.deepEqual(calls, []);
  await rm(lock);
  const results = await server.pollOnce();
  assert.match(results[0].error, /Fetch failed \[REDACTED\]/);
  assert.deepEqual(results[1], { bot_id: "202", more: false });
  assert.equal(logs.length, 1);
  for (const token of Object.values(env)) assert.ok(!logs[0].includes(token));
  assert.deepEqual((await openStore(dataDir, 202).read()).pending, [["7", 1]]);
});
