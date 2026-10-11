import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";
import { openStore } from "../store.js";

const env = { TELEGRAM_BOT_TOKEN: "101:fake-one", TELEGRAM_BOT_TOKEN_2: "202:fake-two" };
const message = (id, chat = 7, text = "Sent") => ({ message_id: id, date: id,
  chat: { id: chat, type: "private", first_name: "User" },
  from: { id: 101, is_bot: true, first_name: "Bot" }, text });

async function setup(t, reply) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-send-"));
  const calls = [];
  const server = createServer({ env, dataDir, fetch: async (url, options) => {
    const method = url.split("/").at(-1);
    calls.push({ url, method, params: JSON.parse(options.body) });
    return { json: async () => reply(method, calls.at(-1).params) };
  } });
  const client = new Client({ name: "send-test", version: "0.3.0" });
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

test("All message tools need confirmation and preview saved or unknown chats without sending", async (t) => {
  const { call, calls, dataDir } = await setup(t, (method) => {
    assert.equal(method, "getMe");
    return { ok: true, result: { id: 101, username: "bot_101" } };
  });
  const chat = message(1).chat;
  await openStore(dataDir, 101).write({ offset: 0, chats: { 7: { chat, messages: [] } } });
  const tools = [
    ["send_message", "sendMessage", { text: "Hello" }],
    ["edit_message", "editMessageText", { message_id: 1, text: "Edit" }],
    ["delete_message", "deleteMessage", { message_id: 1 }],
    ["forward_message", "forwardMessage", { from_chat_id: 8, message_id: 1 }],
  ];
  for (const [name, method, params] of tools) {
    for (const confirm of [{}, { confirm: false }]) {
      const chat_id = confirm.confirm === false ? 9 : 7;
      const result = await call(name, { chat_id, ...params, ...confirm });
      assert.equal(result.sent, false);
      assert.deepEqual(result.preview, { bot_id: "101", chat: chat_id === 7 ? chat : null,
        method, params: { chat_id, ...params } });
      assert.match(result.notice, /Show this preview to the user\. Call again with confirm=true after the user agrees\./);
      assert.match(result.rate_reminder, /1 message per second.*20 messages per minute.*30 messages per second.*429.*retry_after.*one token/);
    }
  }
  assert.equal(calls.length, 0);
  const preview = await call("send_message", { bot: "@BOT_101", chat_id: 7, text: "Hello" });
  assert.equal(preview.preview.bot_id, "101");
  assert.deepEqual(calls.map(({ method }) => method), ["getMe"]);
  assert.equal((await call("send_message", { bot: "@unknown", chat_id: 7, text: "Hello" })).isError, true);
  assert.ok(calls.every(({ method }) => method === "getMe"));
});

test("Send maps reply parameters and saves both sides of the chat", async (t) => {
  const incoming = { ...message(1, 7, "Incoming"), from: { id: 9, is_bot: false, first_name: "User" } };
  const sent = message(2, 7, "<b>Hello</b>");
  const { call, calls, dataDir } = await setup(t, (method) => ({ ok: true,
    result: method === "getUpdates" ? [{ update_id: 1, message: incoming }] : sent }));
  await call("read_new_messages");
  const result = await call("send_message", { chat_id: 7, text: sent.text, parse_mode: "HTML",
    reply_to_message_id: 1, disable_notification: false, confirm: true });
  assert.deepEqual(result, { ...sent, rate_reminder: result.rate_reminder });
  assert.ok(result.rate_reminder);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "sendMessage");
  assert.deepEqual(calls[1].params, { chat_id: 7, text: sent.text, parse_mode: "HTML",
    reply_parameters: { message_id: 1 }, disable_notification: false });
  const saved = await call("get_chat_messages", { chat_id: 7 });
  assert.deepEqual(saved.messages.map(({ text, from }) => [text, from.is_bot]), [["Incoming", false], [sent.text, true]]);
  assert.equal((await openStore(dataDir, 101).read()).offset, 2);
});

test("Edit replaces saved text and delete removes the saved message", async (t) => {
  const { call, calls } = await setup(t, (method, params) => ({ ok: true,
    result: method === "deleteMessage" ? true : { ...message(2, 7, params.text),
      ...(method === "editMessageText" ? { edit_date: 3 } : {}) } }));
  await call("send_message", { chat_id: "7", text: "Original", confirm: true });
  assert.deepEqual(calls[0].params, { chat_id: "7", text: "Original" });
  const edit = await call("edit_message", { chat_id: 7, message_id: 2, text: "Changed",
    parse_mode: "MarkdownV2", confirm: true });
  assert.ok(edit.rate_reminder);
  assert.equal(calls[1].method, "editMessageText");
  assert.deepEqual(calls[1].params, { chat_id: 7, message_id: 2, text: "Changed", parse_mode: "MarkdownV2" });
  const saved = (await call("get_chat_messages", { chat_id: 7 })).messages;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, "Changed");
  assert.equal(saved[0].edited, true);
  assert.equal(saved[0].edit_date, 3);
  const deleted = await call("delete_message", { chat_id: 7, message_id: 2, confirm: true });
  assert.equal(deleted.deleted, true);
  assert.ok(deleted.rate_reminder);
  assert.equal(calls[2].method, "deleteMessage");
  assert.deepEqual(calls[2].params, { chat_id: 7, message_id: 2 });
  assert.deepEqual((await call("get_chat_messages", { chat_id: 7 })).messages, []);
});

test("Forward saves messages without update IDs under the target chat", async (t) => {
  let id = 0;
  const { call, calls } = await setup(t, (method, params) => ({ ok: true,
    result: message(++id, params.chat_id, "Forwarded") }));
  for (const extra of [{ disable_notification: true }, {}]) {
    const result = await call("forward_message", { chat_id: 8, from_chat_id: 7, message_id: 10, ...extra, confirm: true });
    assert.ok(result.rate_reminder);
    assert.equal(calls.at(-1).method, "forwardMessage");
    assert.deepEqual(calls.at(-1).params, { chat_id: 8, from_chat_id: 7, message_id: 10, ...extra });
  }
  assert.equal((await call("get_chat_messages", { chat_id: 8 })).messages.length, 2);
  assert.deepEqual((await call("get_chat_messages", { chat_id: 7 })).messages, []);
});

test("Bot 202 uses its token and stores messages in its own directory", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true, result: message(1) }));
  const preview = await call("send_message", { bot: "202", chat_id: 7, text: "Second" });
  assert.equal(preview.preview.bot_id, "202");
  assert.equal(calls.length, 0);
  await call("send_message", { bot: "202", chat_id: 7, text: "Second", confirm: true });
  assert.equal(calls[0].url, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN_2}/sendMessage`);
  assert.equal((await openStore(dataDir, 202).read()).chats[7].messages.length, 1);
  assert.deepEqual(await openStore(dataDir, 101).read(), { offset: 0, chats: {} });
});

test("API errors redact both tokens and tell the caller to wait on 429", async (t) => {
  const { call } = await setup(t, () => ({ ok: false, error_code: 429,
    description: Object.values(env).join(" "), parameters: { retry_after: 9 } }));
  const result = await call("send_message", { chat_id: 7, text: "Hello", confirm: true });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /\[REDACTED\] \[REDACTED\].*Retry after 9 s\. Stop sending\./);
});

test("A store lock failure preserves API success and does not overwrite the store", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => ({ ok: true, result: message(1) }));
  const lock = path.join(dataDir, "101/poll.lock");
  await mkdir(path.dirname(lock));
  await writeFile(lock, "Locked");
  const result = await call("send_message", { chat_id: 7, text: "Hello", confirm: true });
  assert.equal(result.message_id, 1);
  assert.ok(result.rate_reminder);
  assert.match(result.store_error, /Another process is reading messages/);
  assert.equal(calls.length, 1);
  assert.equal(await readFile(lock, "utf8"), "Locked");
  assert.deepEqual(await openStore(dataDir, 101).read(), { offset: 0, chats: {} });
});
