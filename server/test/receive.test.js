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
const allowed_updates = ["message", "edited_message", "channel_post", "edited_channel_post",
  "my_chat_member", "business_connection", "business_message", "edited_business_message", "deleted_business_messages"];
const update = (id, chat = 7) => ({ update_id: id, message: { message_id: id, date: id,
  chat: { id: chat, type: "private", first_name: "User" }, text: `Message ${id}` } });

async function setup(t, reply) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-store-"));
  const calls = [];
  const server = createServer({ env, dataDir, fetch: async (url, options) => {
    const method = url.split("/").at(-1);
    if (method === "getMe") return { json: async () => ({ ok: true, result: { id: 101, username: "my_bot" } }) };
    calls.push({ method, params: JSON.parse(options.body), signal: options.signal });
    return { json: async () => reply(method, calls.at(-1).params) };
  } });
  const client = new Client({ name: "receive-test", version: "1.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { dataDir, calls, call: async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    for (const token of Object.values(env)) assert.ok(!JSON.stringify(result).includes(token));
    return result.isError ? result : ["read_new_messages", "get_chat_messages", "set_filters"].includes(name)
      ? result.content[0].text : JSON.parse(result.content[0].text);
  } };
}

test("Receive saves short fields and offsets; edits replace messages and duplicates are skipped", async (t) => {
  const first = update(10);
  Object.assign(first.message, { extra: "raw", from: { id: 9, is_bot: false, first_name: "User", extra: "raw" },
    reply_to_message: { message_id: 3, from: { id: 101 }, text: "raw" }, photo: [
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
  assert.match(result, /bot 101: 2 new messages\. offset 14\./);
  assert.match(result, /\[photo id=large\]/);
  const firstSaved = (await openStore(dataDir, 101).read()).chats[7].messages[1];
  assert.deepEqual(firstSaved, { update_id: 10, message_id: 10, date: 10, chat_id: 7,
    from: { id: 9, is_bot: false, first_name: "User" }, text: "Message 10",
    file: { kind: "photo", file_id: "large", file_size: 99 }, reply_to_message_id: 3, reply_to_from_id: 101 });
  const edited = await call("read_new_messages");
  assert.match(edited, /1 new messages.*offset 15/);
  assert.match(edited, /\(edited\)/);
  assert.equal((await openStore(dataDir, 101).read()).chats[7].messages[1].edit_date, 20);
  assert.match(await call("read_new_messages"), /no new messages/);
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

test("A location message is shown and a new_chat_members message is filtered as service", async (t) => {
  const location = update(1);
  delete location.message.text;
  location.message.location = { latitude: 31, longitude: 121 };
  const joined = update(2);
  delete joined.message.text;
  joined.message.new_chat_members = [{ id: 9, first_name: "User" }];
  const { call, dataDir } = await setup(t, () => ({ ok: true, result: [location, joined] }));
  const output = await call("read_new_messages");
  assert.match(output, /\(chat 7\) #1 /);
  assert.doesNotMatch(output, /#2 /);
  assert.match(output, /已收起 1 条/);
  const saved = (await openStore(dataDir, 101).read()).chats[7].messages;
  assert.equal(saved[0].service, undefined);
  assert.equal(saved[1].service, true);
});

test("Receive saves bot joins and leaves without messages", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true, result: [
    { update_id: 2, my_chat_member: { chat: { id: -10, type: "group", title: "Joined", extra: "raw" },
      new_chat_member: { status: "member" } } },
    { update_id: 3, my_chat_member: { chat: { id: -20, type: "group", title: "Left" },
      new_chat_member: { status: "left" } } },
  ] }));
  const store = openStore(dataDir, 101);
  const state = await store.read();
  addUpdates(state, [update(1)]);
  state.pending = [];
  await store.write(state);
  const output = await call("read_new_messages");
  assert.match(output, /no new messages/);
  assert.doesNotMatch(output, /\(chat -10\)|\(chat -20\)| #\d+ /);
  assert.ok(calls[0].params.allowed_updates.includes("my_chat_member"));
  assert.deepEqual(await call("list_chats"), [
    { id: 7, chat_key: "7", type: "private", first_name: "User", message_count: 1, last_message_date: 1 },
    { id: -10, chat_key: "-10", type: "group", title: "Joined", message_count: 0, last_message_date: null },
    { id: -20, chat_key: "-20", type: "group", title: "Left", message_count: 0, last_message_date: null, left: true },
  ]);
  const saved = await store.read();
  assert.deepEqual(saved.chats[-10], { chat: { id: -10, type: "group", title: "Joined" }, messages: [] });
  assert.deepEqual(saved.chats[-20], { chat: { id: -20, type: "group", title: "Left" }, messages: [], left: true });
  assert.deepEqual(saved.pending, []);
  assert.equal(saved.offset, 4);
});

test("A non-business message clears a stale left flag", () => {
  const state = { chats: {}, pending: [] };
  addUpdates(state, [{ update_id: 1, my_chat_member: {
    chat: update(2).message.chat, new_chat_member: { status: "left" },
  } }]);
  addUpdates(state, [{ update_id: 2, business_message: {
    ...update(2).message, business_connection_id: "conn",
  } }]);
  assert.equal(state.chats[7].left, true);
  addUpdates(state, [update(3)]);
  assert.equal(Object.hasOwn(state.chats[7], "left"), false);
});

test("Receive omits stale or unknown offsets and saves the last update time only for nonempty batches", async (t) => {
  const now = 2000000;
  t.mock.method(Date, "now", () => now * 1000);
  let updates = [];
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true, result: updates }));
  const store = openStore(dataDir, 101);
  for (const last_update_at of [now - 6 * 24 * 60 * 60 - 1, now - 6 * 24 * 60 * 60,
    undefined, now - 6 * 24 * 60 * 60 + 1]) {
    const state = { offset: 100, chats: {}, pending: [], ...(last_update_at === undefined ? {} : { last_update_at }) };
    await store.write(state);
    updates = [];
    await call("read_new_messages");
    assert.deepEqual(calls.at(-1).params, { timeout: 0, limit: 100, allowed_updates,
      ...(last_update_at === now - 6 * 24 * 60 * 60 + 1 ? { offset: 100 } : {}) });
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

test("Receive stores 250 updates in three batches and saves each offset before the next fetch", async (t) => {
  let batch = 0;
  const { call, calls, dataDir } = await setup(t, async () => {
    const saved = await openStore(dataDir, 101).read();
    assert.equal(saved.offset, batch === 0 ? 0 : batch * 100 + 1);
    assert.equal(saved.pending.length, batch * 100);
    const start = batch++ * 100;
    return { ok: true, result: Array.from({ length: start < 200 ? 100 : 50 }, (_, i) => update(start + i + 1)) };
  });
  const output = await call("read_new_messages", { timeout: 2, limit: 1000 });
  assert.match(output, /250 new messages\. offset 251\./);
  assert.doesNotMatch(output, /More updates are waiting|还有/);
  assert.deepEqual(calls.map(({ params }) => params), [0, 101, 201].map((offset, i) =>
    ({ offset, timeout: i === 0 ? 2 : 0, limit: 100, allowed_updates })));
  const saved = await openStore(dataDir, 101).read();
  assert.equal(saved.offset, 251);
  assert.deepEqual(saved.chats[7].messages.map((message) => message.message_id),
    Array.from({ length: 250 }, (_, i) => i + 1));
  assert.deepEqual(saved.pending, []);
});

test("Receive shows 150 pending messages in two pages with no repeats", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true, result: [] }));
  const store = openStore(dataDir, 101);
  const state = await store.read();
  addUpdates(state, Array.from({ length: 150 }, (_, i) => {
    const item = update(i + 1, i < 120 ? -1002 : -1003);
    item.message.chat = { id: item.message.chat.id, type: "group", title: i < 120 ? "销售群" : "运营群" };
    return item;
  }));
  await store.write(state);
  const first = await call("read_new_messages", { limit: 100 });
  assert.match(first, /100 new messages/);
  assert.match(first, /还有 50 条没显示。再次调用 read_new_messages 显示下一批，或用 get_chat_messages 查看某个群。/);
  assert.match(first, /- 销售群 \(chat -1002\): 还有 20 条/);
  assert.match(first, /- 运营群 \(chat -1003\): 还有 30 条/);
  assert.equal((await store.read()).pending.length, 50);
  const second = await call("read_new_messages", { limit: 100 });
  assert.match(second, /50 new messages/);
  assert.doesNotMatch(second, /还有/);
  const ids = (text) => [...text.matchAll(/\) #(\d+) /g)].map((match) => Number(match[1]));
  assert.deepEqual(ids(first), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual(ids(second), Array.from({ length: 50 }, (_, i) => i + 101));
  assert.equal(new Set([...ids(first), ...ids(second)]).size, 150);
  assert.deepEqual((await store.read()).pending, []);
  assert.equal(calls.length, 2);
});

test("Receive stops after 20 full batches and keeps messages for the next page", async (t) => {
  let id = 0;
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true,
    result: Array.from({ length: 100 }, () => update(++id)) }));
  const output = await call("read_new_messages");
  assert.match(output, /200 new messages\. offset 2001\./);
  assert.match(output, /More updates are waiting\. Call read_new_messages again\./);
  assert.match(output, /还有 1800 条没显示/);
  assert.equal(calls.length, 20);
  const saved = await openStore(dataDir, 101).read();
  assert.equal(saved.chats[7].messages.length, 2000);
  assert.equal(saved.pending.length, 1800);
});

test("Pending edits keep their place; owner messages stay out and deleted messages are skipped", async (t) => {
  const { call, dataDir } = await setup(t, () => ({ ok: true, result: [] }));
  const store = openStore(dataDir, 101);
  const state = await store.read();
  const business = (id, from = 9) => ({ ...update(id).message, business_connection_id: "conn", from: { id: from } });
  addUpdates(state, [
    { update_id: 1, business_connection: { id: "conn", user: { id: 1 } } },
    { update_id: 2, business_message: business(1) },
    { update_id: 3, business_message: business(2) },
    { update_id: 4, business_message: business(3, 1) },
    update(5),
    { update_id: 6, edited_business_message: { ...business(1), text: "Updated text" } },
    { update_id: 7, deleted_business_messages: {
      business_connection_id: "conn", chat: { id: 7 }, message_ids: [2],
    } },
  ]);
  assert.deepEqual(state.pending, [["conn:7", 1], ["conn:7", 2], ["7", 5]]);
  await store.write(state);
  const output = await call("read_new_messages", { limit: 1 });
  assert.match(output, /1 new messages/);
  assert.match(output, /\(edited\).*Updated text/);
  assert.doesNotMatch(output, /#2 |#3 /);
  assert.match(output, /还有 1 条没显示/);
  assert.deepEqual((await store.read()).pending, [["7", 5]]);
  const next = await call("read_new_messages", { limit: 1 });
  assert.match(next, /#5 /);
  assert.doesNotMatch(next, /Updated text|还有/);
  assert.deepEqual((await store.read()).pending, []);
});

test("Store keeps the last 2000 messages per chat", () => {
  const state = { offset: 0, chats: {}, pending: [] };
  addUpdates(state, Array.from({ length: 2000 }, (_, i) => update(i + 1)));
  state.pending = [];
  addUpdates(state, Array.from({ length: 50 }, (_, i) => update(i + 2001)));
  addUpdates(state, [update(2051, 8)]);
  assert.equal(state.chats[7].messages.length, 2000);
  assert.equal(state.chats[7].messages[0].message_id, 51);
  assert.equal(state.chats[7].messages.at(-1).message_id, 2050);
  assert.equal(state.chats[8].messages.length, 1);
});

test("Store keeps pending messages beyond the chat limit", () => {
  const state = { offset: 0, chats: {}, pending: [] };
  addUpdates(state, Array.from({ length: 2050 }, (_, i) => update(i + 1)));
  assert.equal(state.chats[7].messages.length, 2050);
  assert.ok(state.pending.every(([, id]) => state.chats[7].messages.some((message) => message.message_id === id)));
  state.pending = [["7", 1], ["8", 2]];
  addUpdates(state, [update(2051)]);
  assert.equal(state.chats[7].messages.length, 2001);
  assert.equal(state.chats[7].messages[0].message_id, 1);
  assert.equal(state.chats[7].messages[1].message_id, 52);
});

test("Pending pages put private chats, mentions, and replies first in each mode", async (t) => {
  const { call, dataDir } = await setup(t, () => ({ ok: true, result: [] }));
  const store = openStore(dataDir, 101);
  for (const mode of ["all", "for_me", undefined]) {
    const state = { offset: 0, chats: {}, pending: [] };
    const updates = Array.from({ length: 6 }, (_, i) => update(i + 1, i === 2 ? 7 : -10));
    for (const item of updates) {
      if (item.message.chat.id === -10) item.message.chat = { id: -10, type: "group", title: "Group" };
    }
    updates[3].message.text = "@my_bot Hello";
    updates[5].message.reply_to_message = { message_id: 10, from: { id: 101 } };
    addUpdates(state, updates);
    await store.write(state);
    const ids = (text) => [...text.matchAll(/ #(\d+) /g)].map((match) => Number(match[1]));
    assert.deepEqual(ids(await call("read_new_messages", { limit: 2, mode })), [3, 4]);
    assert.deepEqual((await store.read()).pending, [["-10", 1], ["-10", 2], ["-10", 5], ["-10", 6]]);
    assert.deepEqual(ids(await call("read_new_messages", { limit: 2, mode })), mode === "for_me" ? [6] : [6, 1]);
    assert.deepEqual((await store.read()).pending, [["-10", 2], ["-10", 5]]);
  }
});

test("Chat history removes shown messages from pending without repeats", async (t) => {
  const { call, dataDir } = await setup(t, () => ({ ok: true, result: [] }));
  const store = openStore(dataDir, 101);
  for (const args of [{ limit: 2 }, { message_id: 3, context: 0 }]) {
    const state = { offset: 0, chats: {}, pending: [] };
    const updates = [update(1), update(2), update(3), update(1, 8)];
    updates[2].message.reply_to_message = { message_id: 1 };
    addUpdates(state, updates);
    await store.write(state);
    const history = await call("get_chat_messages", { chat_id: 7, ...args });
    const ids = [...history.matchAll(/ #(\d+) /g)].map((match) => Number(match[1]));
    assert.deepEqual(ids, args.message_id ? [1, 3] : [2, 3]);
    assert.deepEqual((await store.read()).pending, [["7", args.message_id ? 2 : 1], ["8", 1]]);
    const next = await call("read_new_messages");
    for (const id of ids) assert.ok(!next.includes(`(chat 7) #${id} `));
    assert.match(next, /\(chat 8\) #1 /);
  }
});

test("Local tools list seen chats and select recent messages without fetch", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => assert.fail("Local tools must not call fetch"));
  const store = openStore(dataDir, 101);
  const state = await store.read();
  addUpdates(state, [update(1), update(2), update(3), update(4), update(5, 8)]);
  await store.write(state);
  assert.deepEqual(await call("list_chats"), [
    { id: 8, chat_key: "8", type: "private", first_name: "User", message_count: 1, last_message_date: 5 },
    { id: 7, chat_key: "7", type: "private", first_name: "User", message_count: 4, last_message_date: 4 },
  ]);
  const recent = await call("get_chat_messages", { bot: "101", chat_id: "7", limit: 2 });
  assert.deepEqual([...recent.matchAll(/ #(\d+) /g)].map((match) => Number(match[1])), [3, 4]);
  const before = await call("get_chat_messages", { chat_id: 7, limit: 2, before_message_id: 4 });
  assert.deepEqual([...before.matchAll(/ #(\d+) /g)].map((match) => Number(match[1])), [2, 3]);
  assert.equal(calls.length, 0);
});

test("Message filters return compact text, need confirmation, and do not leak tokens", async (t) => {
  let batch = 0;
  const { call, dataDir } = await setup(t, () => ({ ok: true, result: [
    { update_id: ++batch, message: { message_id: batch, date: 1791684300,
      chat: { id: 7, type: "private", first_name: "Alice" }, from: { id: 9, first_name: "Alice" },
      text: `hello ${env.TELEGRAM_BOT_TOKEN}` } },
    { update_id: ++batch, message: { message_id: batch, date: 1791685800,
      chat: { id: -1001, type: "group", title: "Ops" }, text: "group content" } },
    { update_id: ++batch, message: { message_id: batch, date: 1791684360,
      chat: { id: 7, type: "private", first_name: "Alice" }, text: "订单 hidden content" } },
  ] }));
  const file = path.join(dataDir, "101/filters.json");
  const current = await call("get_filters");
  assert.deepEqual(current.protected_words, ["投诉", "退款", "急"]);
  assert.equal(current.default_mode, "all");
  assert.ok(Object.entries(current).filter(([key]) => key !== "default_mode")
    .every(([key, value]) => Array.isArray(value) && (key === "protected_words" || !value.length)));
  const preview = await call("set_filters", { exclude_keywords: ["订单"] });
  assert.match(preview, /以后包含『订单』的消息不再显示给你。/);
  assert.match(preview, /按现在已保存的消息算，没有消息会被收起。/);
  assert.match(preview, /要保存这条规则吗？\nAI: Show the text above to the owner.*confirm=true only after the owner clearly agrees/);
  assert.doesNotMatch(preview, /regex|JSON|chat_id/);
  await assert.rejects(readFile(file), { code: "ENOENT" });
  const confirmed = await call("set_filters", { exclude_keywords: ["订单"], confirm: true });
  assert.match(confirmed, /^已保存。\n以后包含『订单』的消息不再显示给你。\n如果有消息被误收/);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { ...current, exclude_keywords: ["订单"] });
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(path.dirname(file))).mode & 0o777, 0o700);
  await call("set_filters", { include_keywords: ["check"], confirm: true });
  assert.deepEqual((await call("get_filters")).exclude_keywords, ["订单"]);
  const invalid = await call("set_filters", { exclude_regex: ["["], confirm: true });
  assert.equal(invalid.isError, true);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).exclude_regex, []);

  const output = await call("read_new_messages");
  assert.match(output, /\[private\] Alice \(chat 7\) #1 2026-10-11 02:05Z Alice: hello \[REDACTED\]/);
  assert.match(output, /\[group\] Ops \(chat -1001\) #2 2026-10-11 02:30Z group content/);
  assert.doesNotMatch(output, /Group summary|已收起/);
  assert.match(output, /订单 hidden content/);
  const store = openStore(dataDir, 101);
  const state = await store.read();
  assert.equal(state.chats[7].messages.length, 2);
  assert.equal(state.chats[7].messages[1].text, "订单 hidden content");
  state.chats[7].messages[0].text = `hello ${Object.values(env).join(" ")}`;
  await store.write(state);
  const saved = await call("get_chat_messages", { chat_id: 7 });
  assert.match(saved, /hello \[REDACTED\] \[REDACTED\]/);
  assert.match(saved, /hidden content/);
  assert.doesNotMatch(saved, /已收起/);
  const shown = await call("get_chat_messages", { chat_id: 7, show_filtered: true });
  assert.match(shown, /订单 hidden content/);
  assert.doesNotMatch(shown, /已收起 \d/);
  assert.match(await call("get_chat_messages", { chat_id: -1001 }), /group content/);
  const all = await call("read_new_messages", { mode: "all" });
  assert.match(all, /group content/);
  assert.match(all, /订单 hidden content/);
  assert.doesNotMatch(all, /Group summary|已收起/);
});

test("Filter previews classify all saved chats, cap examples, and never save without confirmation", async (t) => {
  const { call, dataDir } = await setup(t, () => assert.fail("Preview must not receive new messages"));
  const store = openStore(dataDir, 101);
  const state = await store.read();
  addUpdates(state, Array.from({ length: 6 }, (_, i) => ({ update_id: i, message: {
    message_id: i, date: i,
    chat: i < 2 ? { id: 7, type: "private", first_name: "李四" } : { id: -1001, type: "group", title: "运营群" },
    from: { id: 9, first_name: "张三" },
    text: i === 4 ? "keep" : `订单 ${Object.values(env).join(" ")}\n${"长".repeat(100)}`,
    ...(i === 5 ? { sticker: { file_id: "sticker" } } : {}),
  } })));
  await store.write(state);
  const file = path.join(store.dir, "filters.json");
  const exclude_rules = [{ words: ["订单"], include_for_me: true }];
  const preview = await call("set_filters", { exclude_rules });
  assert.match(preview, /会多收起 4 条/);
  const examples = preview.split("\n").filter((line) => line.startsWith("- "));
  assert.equal(examples.length, 3);
  assert.match(examples[0], /^- 张三（李四）：订单 \[REDACTED\] \[REDACTED\]/);
  assert.match(examples[2], /^- 张三（运营群）：/);
  assert.ok(examples.every((line) => Array.from(line.split("：")[1]).length <= 61 && line.endsWith("…")));
  assert.doesNotMatch(preview, /regex|JSON|chat_id/);
  await assert.rejects(readFile(file), { code: "ENOENT" });
  assert.deepEqual(await store.read(), state);
  await call("set_filters", { exclude_rules, confirm: true });
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).exclude_rules, exclude_rules);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const saved = await stat(file);
  for (const confirm of [false, true]) {
    assert.equal(await call("set_filters", { exclude_rules, confirm }), "规则没有变化。");
    assert.equal((await stat(file)).mtimeMs, saved.mtimeMs);
  }
  assert.match(await call("set_filters", { exclude_rules: [] }), /取消同时包含『订单』的消息不再显示给你的规则。\n按现在已保存的消息算，没有消息会被收起。会少收起 4 条。/);
  assert.match(await call("set_filters", { include_keywords: ["keep"] }), /没有消息会被收起/);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).exclude_rules, exclude_rules);
  await call("set_filters", { exclude_rules: [], confirm: true });
  assert.deepEqual((await call("get_filters")).exclude_rules, []);
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
  assert.deepEqual(await openStore(dataDir, 101).read(), { offset: 0, chats: {}, pending: [] });
});

test("Channel edits, captions, and each file kind use short fields", () => {
  const state = { offset: 0, chats: {}, pending: [] };
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
