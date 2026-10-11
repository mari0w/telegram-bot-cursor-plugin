import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";
import { addUpdates, openStore } from "../store.js";

const env = { TELEGRAM_BOT_TOKEN: "101:fake-one", TELEGRAM_BOT_TOKEN_2: "202:fake-two" };
const allowed_updates = ["message", "edited_message", "channel_post", "edited_channel_post"];
const update = (id, chat = 7) => ({ update_id: id, message: { message_id: id, date: id,
  chat: { id: chat, type: "private", first_name: "User" }, text: `Message ${id}` } });

async function setup(t, reply) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-store-"));
  const calls = [];
  const server = createServer({ env, dataDir, fetch: async (url, options) => {
    const method = url.split("/").at(-1);
    calls.push({ method, params: JSON.parse(options.body), signal: options.signal });
    return { json: async () => reply(method, calls.at(-1).params) };
  } });
  const client = new Client({ name: "receive-test", version: "0.2.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { dataDir, calls, call: async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    for (const token of Object.values(env)) assert.ok(!JSON.stringify(result).includes(token));
    return result.isError ? result : JSON.parse(result.content[0].text);
  } };
}

test("Receive saves short fields and offsets; edits replace messages and duplicates are skipped", async (t) => {
  const first = update(10);
  Object.assign(first.message, { extra: "raw", from: { id: 9, is_bot: false, first_name: "User", extra: "raw" },
    reply_to_message: { message_id: 3, text: "raw" }, photo: [
      { file_id: "small", width: 10, height: 10 },
      { file_id: "large", width: 100, height: 100, file_size: 99, file_unique_id: "raw" },
    ] });
  first.message.chat.extra = "raw";
  const incoming = update(12);
  incoming.message.text = env.TELEGRAM_BOT_TOKEN_2;
  const edit = { update_id: 14, edited_message: { ...first.message, text: "Edited", edit_date: 20 } };
  const batches = [[incoming, first, { update_id: 13, callback_query: { data: "raw" } }], [first, edit], []];
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true, result: batches.shift() }));
  const result = await call("read_new_messages", { timeout: 2 });
  assert.equal(result.bot_id, "101");
  assert.equal(result.count, 2);
  assert.equal(result.offset, 14);
  assert.equal(result.more, false);
  assert.deepEqual(result.messages[1], { update_id: 10, message_id: 10, date: 10, chat_id: 7,
    from: { id: 9, is_bot: false, first_name: "User" }, text: "Message 10",
    file: { kind: "photo", file_id: "large", file_size: 99 }, reply_to_message_id: 3 });
  const edited = await call("read_new_messages");
  assert.equal(edited.count, 1);
  assert.equal(edited.messages[0].edited, true);
  assert.equal(edited.messages[0].edit_date, 20);
  assert.equal((await call("read_new_messages")).offset, 15);
  assert.deepEqual(calls.map(({ params }) => params), [
    { offset: 0, timeout: 2, limit: 100, allowed_updates }, { offset: 14, timeout: 0, limit: 100, allowed_updates },
    { offset: 15, timeout: 0, limit: 100, allowed_updates },
  ]);
  assert.ok(calls.every(({ signal }) => signal instanceof AbortSignal));
  const saved = await openStore(dataDir, 101).read();
  assert.equal(saved.offset, 15);
  assert.equal(saved.chats[7].messages.length, 2);
  assert.equal(saved.chats[7].messages.find((message) => message.message_id === 10).text, "Edited");
  assert.deepEqual(saved.chats[7].chat, { id: 7, type: "private", first_name: "User" });
  assert.ok(!JSON.stringify(saved).includes("raw"));
  assert.equal(saved.chats[7].messages.find((message) => message.message_id === 12).text, "[REDACTED]");
  assert.equal((await stat(path.join(dataDir, "101"))).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(dataDir, "101/store.json"))).mode & 0o777, 0o600);
  await assert.rejects(readFile(path.join(dataDir, "101/poll.lock")), { code: "ENOENT" });
});

test("Receive omits stale or unknown offsets and saves the last update time only for nonempty batches", async (t) => {
  const now = 2000000;
  t.mock.method(Date, "now", () => now * 1000);
  let updates = [];
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true, result: updates }));
  const store = openStore(dataDir, 101);
  for (const last_update_at of [now - 7 * 24 * 60 * 60 - 1, now - 7 * 24 * 60 * 60,
    undefined, now - 7 * 24 * 60 * 60 + 1]) {
    const state = { offset: 100, chats: {}, ...(last_update_at === undefined ? {} : { last_update_at }) };
    await store.write(state);
    updates = [];
    await call("read_new_messages");
    assert.deepEqual(calls.at(-1).params, { timeout: 0, limit: 100, allowed_updates,
      ...(last_update_at === now - 7 * 24 * 60 * 60 + 1 ? { offset: 100 } : {}) });
    assert.deepEqual(await store.read(), state);
    updates = [update(10)];
    await call("read_new_messages");
    const saved = await store.read();
    assert.equal(saved.offset, 11);
    assert.equal(saved.last_update_at, now);
    updates = [];
    await call("read_new_messages");
    assert.deepEqual(calls.at(-1).params, { offset: 11, timeout: 0, limit: 100, allowed_updates });
    assert.deepEqual(await store.read(), saved);
  }
});

test("Receive keeps the last 200 messages per chat and reports full batches", async (t) => {
  let id = 0;
  const { call, dataDir } = await setup(t, () => ({ ok: true,
    result: Array.from({ length: id < 200 ? 100 : 5 }, () => update(++id)) }));
  assert.equal((await call("read_new_messages")).more, true);
  await call("read_new_messages");
  assert.equal((await call("read_new_messages")).more, false);
  const saved = await openStore(dataDir, 101).read();
  assert.equal(saved.chats[7].messages.length, 200);
  assert.equal(saved.chats[7].messages[0].message_id, 6);
  assert.equal(saved.chats[7].messages.at(-1).message_id, 205);
});

test("Local tools list seen chats and select recent messages without fetch", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => assert.fail("Local tools must not call fetch"));
  const store = openStore(dataDir, 101);
  const state = await store.read();
  addUpdates(state, [update(1), update(2), update(3), update(4), update(5, 8)]);
  await store.write(state);
  assert.deepEqual(await call("list_chats"), [
    { id: 8, type: "private", first_name: "User", message_count: 1, last_message_date: 5 },
    { id: 7, type: "private", first_name: "User", message_count: 4, last_message_date: 4 },
  ]);
  const recent = await call("get_chat_messages", { bot: "101", chat_id: "7", limit: 2 });
  assert.deepEqual(recent.chat, state.chats[7].chat);
  assert.deepEqual(recent.messages.map((message) => message.message_id), [3, 4]);
  assert.deepEqual((await call("get_chat_messages", { chat_id: 7, limit: 2, before_message_id: 4 }))
    .messages.map((message) => message.message_id), [2, 3]);
  assert.equal(calls.length, 0);
});

test("An existing poll lock gives a clear error without fetch", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => assert.fail("Locked receive must not call fetch"));
  const lock = path.join(dataDir, "101/poll.lock");
  await mkdir(path.dirname(lock));
  await writeFile(lock, "");
  const result = await call("read_new_messages");
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Another process is reading messages for this bot\. Try again later\./);
  assert.ok(result.content[0].text.includes(`If no other process runs, delete ${lock}`));
  assert.equal(calls.length, 0);
  assert.equal(await readFile(lock, "utf8"), "");
});

test("Webhook deletion needs confirmation; webhook info redacts all configured tokens", async (t) => {
  const { call, calls } = await setup(t, (method) => ({ ok: true, result: method === "deleteWebhook" ? true : {
    url: `https://example.com/${env.TELEGRAM_BOT_TOKEN}`, last_error_message: env.TELEGRAM_BOT_TOKEN_2,
  } }));
  const preview = await call("delete_webhook");
  assert.deepEqual(preview.preview, { bot_id: "101", method: "deleteWebhook", params: { drop_pending_updates: false } });
  assert.match(preview.notice, /show this preview to the user.*confirm=true after the user agrees/);
  assert.equal(calls.length, 0);
  assert.equal(await call("delete_webhook", { confirm: true, drop_pending_updates: true }), true);
  assert.deepEqual(calls.map(({ method, params }) => ({ method, params })), [
    { method: "deleteWebhook", params: { drop_pending_updates: true } },
  ]);
  assert.deepEqual(await call("get_webhook_info"), {
    url: "https://example.com/[REDACTED]", last_error_message: "[REDACTED]",
  });
});

test("409 errors are redacted and point to webhook tools; the lock is released", async (t) => {
  const { call, dataDir } = await setup(t, () => ({ ok: false, error_code: 409,
    description: `Conflict ${Object.values(env).join(" ")}` }));
  const result = await call("read_new_messages");
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /409 Conflict.*get_webhook_info.*delete_webhook with confirm=true/);
  assert.match(result.content[0].text, /Telegram API getUpdates failed: 409 Conflict \[REDACTED\]/);
  await assert.rejects(readFile(path.join(dataDir, "101/poll.lock")), { code: "ENOENT" });
  assert.deepEqual(await openStore(dataDir, 101).read(), { offset: 0, chats: {} });
});

test("Channel edits, captions, and each file kind use short fields", () => {
  const state = { offset: 0, chats: {} };
  const kinds = ["document", "video", "audio", "voice", "animation", "sticker", "video_note"];
  const messages = addUpdates(state, kinds.map((kind, i) => ({ update_id: i, channel_post: {
    message_id: i, date: i, chat: { id: -1, type: "channel", title: "News" }, caption: "Caption",
    [kind]: { file_id: kind, file_name: "name", file_size: 5, mime_type: "type", extra: "raw" },
  } })));
  assert.deepEqual(messages.map((message) => message.file), kinds.map((kind) => ({
    kind, file_id: kind, file_name: "name", file_size: 5, mime_type: "type",
  })));
  assert.ok(messages.every((message) => message.text === "Caption"));
  addUpdates(state, [{ update_id: 10, edited_channel_post: { message_id: 0, date: 0,
    chat: { id: -1, type: "channel" }, text: "Changed" } }]);
  assert.equal(state.chats[-1].messages.length, 7);
  assert.equal(state.chats[-1].messages[0].text, "Changed");
});
