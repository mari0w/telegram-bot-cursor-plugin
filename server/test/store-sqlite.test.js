import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import initSqlJs from "sql.js";
import { addBusinessConnection, addMessage, addUpdates, openStore } from "../store.js";

const SQL = await initSqlJs();
const update = (id) => ({ update_id: id, message: { message_id: id, date: id,
  chat: { id: 7, type: "private" }, text: `Message ${id}` } });

async function setup(t) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-sqlite-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const store = openStore(dataDir, 101);
  const file = path.join(store.dir, "store.sqlite");
  const query = async (sql) => {
    const bytes = await readFile(file);
    assert.equal(bytes.subarray(0, 16).toString(), "SQLite format 3\0");
    const db = new SQL.Database(bytes);
    try { return db.exec(sql)[0]?.values ?? []; }
    finally { db.close(); }
  };
  return { store, file, query };
}

test("SQLite creates a private database with no user setup", async (t) => {
  const { store, file, query } = await setup(t);
  assert.deepEqual(await store.read(), { offset: 0, chats: {}, pending: [] });
  assert.equal((await stat(store.dir)).mode & 0o777, 0o700);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"),
    [["chats"], ["messages"], ["meta"]]);
  await assert.rejects(readFile(path.join(store.dir, "store.json")), { code: "ENOENT" });
});

test("A caller waits for a short store lock and then saves without losing state", async (t) => {
  const { store } = await setup(t);
  let acquired;
  const started = new Promise((resolve) => { acquired = resolve; });
  const holder = store.withLock(async () => {
    acquired();
    await delay(150);
    const state = await store.read();
    addUpdates(state, [update(1)]);
    await store.write(state);
  });
  await started;
  await store.withLock(async () => {
    const state = await store.read();
    assert.deepEqual(state.pending, [["7", 1]]);
    addUpdates(state, [update(2)]);
    await store.write(state);
  });
  await holder;
  assert.deepEqual((await store.read()).pending, [["7", 1], ["7", 2]]);
});

test("A held store lock retries before it returns STORE_BUSY", async (t) => {
  const { store } = await setup(t);
  await mkdir(store.dir, { recursive: true });
  const lock = path.join(store.dir, "poll.lock");
  await writeFile(lock, "");
  const started = Date.now();
  await assert.rejects(store.withLock(() => assert.fail("The lock is still held")), (error) => {
    assert.equal(error.code, "STORE_BUSY");
    assert.equal(error.message, `Another process is reading messages for this bot. Try again later. If no other process runs, delete ${lock}.`);
    return true;
  });
  assert.ok(Date.now() - started >= 900);
  assert.equal(await readFile(lock, "utf8"), "");
});

test("SQLite persists unsummarized rows and keeps summary timestamps", async (t) => {
  const { store, query } = await setup(t);
  const state = await store.read();
  addUpdates(state, [update(1), update(2)]);
  addMessage(state, update(3).message, { outgoing: true });
  addBusinessConnection(state, { id: "conn", user: { id: 9 }, rights: { can_reply: true } });
  addMessage(state, { ...update(4).message, business_connection_id: "conn", from: { id: 9 } });
  await store.write(state);
  assert.deepEqual(await query("SELECT chat_key, message_id FROM messages WHERE summarized_at IS NULL ORDER BY pending_order"),
    [["7", 1], ["7", 2]]);
  assert.equal((await query("SELECT message_id FROM messages WHERE summarized_at IS NOT NULL")).length, 2);
  const saved = await store.read();
  saved.pending.shift();
  await store.write(saved);
  const timestamp = (await query("SELECT summarized_at FROM messages WHERE message_id = 1"))[0][0];
  assert.equal(typeof timestamp, "number");
  await store.write(await store.read());
  assert.deepEqual(await query("SELECT summarized_at FROM messages WHERE message_id = 1"), [[timestamp]]);
  addUpdates(saved, [{ update_id: 5, edited_message: { ...update(1).message, text: "Edited" } }]);
  await store.write(saved);
  assert.deepEqual((await store.read()).pending, [["7", 2], ["7", 1]]);
});

test("SQLite imports the JSON store once and archives it", async (t) => {
  const { store, query } = await setup(t);
  await mkdir(store.dir, { recursive: true });
  const state = { offset: 0, chats: {}, pending: [] };
  addUpdates(state, [update(1), update(2), update(3)]);
  state.pending = [["7", 3], ["7", 1]];
  state.last_poll_at = 123;
  addBusinessConnection(state, { id: "conn", user: { id: 9, username: "owner" }, user_chat_id: 9, date: 1, is_enabled: true });
  const legacy = path.join(store.dir, "store.json");
  await writeFile(legacy, JSON.stringify(state));
  assert.deepEqual(await store.read(), state);
  assert.deepEqual(await query("SELECT message_id FROM messages WHERE summarized_at IS NULL ORDER BY pending_order"), [[3], [1]]);
  assert.deepEqual(await query("SELECT message_id FROM messages WHERE summarized_at IS NOT NULL"), [[2]]);
  assert.deepEqual(JSON.parse(await readFile(`${legacy}.migrated`, "utf8")), state);
  await assert.rejects(readFile(legacy), { code: "ENOENT" });
  // A later JSON file must not replace a populated SQLite database.
  await writeFile(legacy, JSON.stringify({ offset: 999, chats: {}, pending: [] }));
  assert.deepEqual(await store.read(), state);
  await store.write(state);
  assert.equal(JSON.parse(await readFile(legacy, "utf8")).offset, 999);
});

test("An empty SQLite database can import an existing JSON store", async (t) => {
  const { store, file, query } = await setup(t);
  await store.read();
  const legacy = path.join(store.dir, "store.json");
  const state = { offset: 0, chats: {}, pending: [] };
  addUpdates(state, [update(10)]);
  await writeFile(legacy, JSON.stringify(state));
  assert.deepEqual(await openStore(path.dirname(store.dir), 101).read(), state);
  assert.deepEqual(await query("SELECT message_id FROM messages WHERE summarized_at IS NULL"), [[10]]);
  assert.equal((await readFile(file)).subarray(0, 16).toString(), "SQLite format 3\0");
  await assert.rejects(readFile(legacy), { code: "ENOENT" });
});

test("A failed JSON import logs a safe error and leaves empty SQLite", async (t) => {
  const { store, query } = await setup(t);
  const logs = [];
  t.mock.method(console, "error", (message) => logs.push(message));
  await mkdir(store.dir, { recursive: true });
  const legacy = path.join(store.dir, "store.json");
  await writeFile(legacy, '{"bad": "101:fake-one"');
  assert.deepEqual(await store.read(), { offset: 0, chats: {}, pending: [] });
  assert.deepEqual(await query("SELECT message_id FROM messages"), []);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes("101:fake-one"));
  await store.read();
  assert.equal(logs.length, 1);
  await assert.rejects(readFile(legacy), { code: "ENOENT" });
});
