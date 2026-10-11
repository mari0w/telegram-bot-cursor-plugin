import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";
import { addMessage, openStore } from "../store.js";

const token = "101:short-secret";
const connection = { id: "conn", user: { id: 1, username: "owner" }, user_chat_id: 1,
  rights: { can_reply: true }, is_enabled: true, date: 1 };
const message = (id, user = 9, text = "Incoming") => ({ message_id: id, date: id,
  business_connection_id: "conn", chat: { id: 7, type: "private", first_name: "Alice" },
  from: { id: user, username: user === 1 ? "owner" : "alice" }, text });

async function setup(t, reply) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-business-"));
  const calls = [];
  const server = createServer({ env: { TELEGRAM_BOT_TOKEN: token }, dataDir, fetch: async (url, options) => {
    const method = url.split("/").at(-1);
    const params = JSON.parse(options.body);
    calls.push({ method, params });
    return Response.json(await reply(method, params));
  } });
  const client = new Client({ name: "business-test", version: "1.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { calls, store: openStore(dataDir, 101), call: async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!JSON.stringify(result).includes(token));
    const text = result.content[0].text;
    return result.isError ? result : ["read_new_messages", "get_chat_messages"].includes(name) ? text : JSON.parse(text);
  } };
}

test("Business receive separates chats, keeps owner context, and removes deleted messages", async (t) => {
  const normal = { ...message(3), text: "Bot chat" };
  delete normal.business_connection_id;
  let updates = [
    { update_id: 1, business_connection: connection },
    { update_id: 2, business_message: message(1, 9, `Incoming ${token}`) },
    { update_id: 3, business_message: message(2, 1, "Owner context") },
    { update_id: 4, message: normal },
  ];
  const { call, store, calls } = await setup(t, (method) => ({ ok: true,
    result: method === "getMe" ? { id: 101, username: "my_bot" } : updates }));
  const output = await call("read_new_messages");
  assert.match(output, /2 new messages/);
  assert.match(output, /\[business private\] Alice \(chat conn:7\).*Incoming \[REDACTED\]/);
  assert.match(output, /\[private\].*\(chat 7\).*Bot chat/);
  assert.doesNotMatch(output, /Owner context|Filtered/);
  const state = await store.read();
  assert.equal(state.business.conn.can_reply, true);
  assert.equal(state.chats["conn:7"].business_connection_id, "conn");
  assert.equal(state.chats["conn:7"].messages[1].outgoing, true);
  assert.equal(state.chats[7].messages.length, 1);
  assert.ok(!JSON.stringify(state).includes(token));
  assert.match(await call("get_chat_messages", { chat_id: "conn:7" }), /@owner \(you\): Owner context/);
  const chats = await call("list_chats");
  assert.ok(chats.some((chat) => chat.id === "conn:7" && chat.chat_key === "conn:7" && chat.business_connection_id === "conn"));
  assert.ok(chats.some((chat) => chat.id === 7 && chat.chat_key === "7"));
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getUpdates"]);
  assert.ok(calls[1].params.allowed_updates.includes("business_connection"));
  assert.ok(calls[1].params.allowed_updates.includes("deleted_business_messages"));
  updates = [{ update_id: 5, business_message: {
    ...message(3), sender_business_bot: { id: 101 },
  } }];
  assert.match(await call("read_new_messages", { mode: "all" }), /no new messages/);
  assert.equal((await store.read()).chats["conn:7"].messages.at(-1).outgoing, true);
  updates = [{ update_id: 6, edited_business_message: { ...message(1), text: "Edited" } }];
  assert.match(await call("read_new_messages"), /\(edited\).*Edited/);
  updates = [{ update_id: 7, deleted_business_messages: {
    business_connection_id: "conn", chat: normal.chat, message_ids: [1],
  } }];
  assert.match(await call("read_new_messages"), /no new messages/);
  assert.deepEqual((await store.read()).chats["conn:7"].messages.map((item) => item.message_id), [2, 3]);
  assert.equal((await store.read()).chats[7].messages.length, 1);
  assert.ok(calls.every(({ method }) => method !== "readBusinessMessage"));
});

test("Business send previews the owner identity and sends with the connection", async (t) => {
  const { call, store, calls } = await setup(t, () => ({ ok: true, result: message(2, 9, `Sent ${token}`) }));
  const state = await store.read();
  addMessage(state, message(1));
  await store.write(state);
  assert.deepEqual(state.business.conn, {});
  const preview = await call("send_message", { chat_id: "conn:7", text: `Reply ${token}` });
  assert.equal(calls.length, 0);
  assert.equal(preview.sent, false);
  assert.match(preview.notice, /^这条会以你本人的身份发送。/);
  assert.equal(preview.preview.chat.id, 7);
  assert.equal(preview.preview.params.text, "Reply [REDACTED]");
  await call("send_message", { chat_id: "conn:7", text: "Reply", confirm: true });
  assert.deepEqual(calls, [{ method: "sendMessage", params: { chat_id: 7, business_connection_id: "conn", text: "Reply" } }]);
  const saved = (await store.read()).chats["conn:7"].messages[1];
  assert.equal(saved.outgoing, true);
  assert.equal(saved.text, "Sent [REDACTED]");
});

test("Outgoing business echoes replace the sent message within the same chat key", () => {
  const state = { chats: {}, pending: [] };
  const sent = message(2, 1, "Sent");
  addMessage(state, { ...sent, business_connection_id: undefined });
  addMessage(state, sent, { outgoing: true });
  addMessage(state, { ...sent, text: "Echo", sender_business_bot: { id: 101 } }, { update_id: 3 });
  const saved = state.chats["conn:7"].messages;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].update_id, 3);
  assert.equal(saved[0].text, "Echo");
  assert.equal(saved[0].outgoing, true);
  assert.equal(state.chats[7].messages[0].text, "Sent");
  assert.deepEqual(state.pending, [["7", 2]]);
});

test("Receive looks up missing and empty connections before it stores owner messages", async (t) => {
  let updates;
  const { call, store, calls } = await setup(t, (method) => ({ ok: true, result: method === "getMe"
    ? { id: 101, username: "my_bot" } : method === "getBusinessConnection" ? connection : updates }));
  for (const business of [undefined, { conn: {} }]) {
    await store.write({ offset: 0, chats: {}, pending: [], ...(business ? { business } : {}) });
    updates = [{ update_id: 1, business_message: message(1, 1, "Owner context") }];
    const before = calls.filter(({ method }) => method === "getBusinessConnection").length;
    assert.match(await call("read_new_messages"), /no new messages/);
    const lookups = calls.filter(({ method }) => method === "getBusinessConnection");
    assert.equal(lookups.length, before + 1);
    assert.deepEqual(lookups.at(-1).params, { business_connection_id: "conn" });
    const state = await store.read();
    assert.equal(state.chats["conn:7"].messages[0].outgoing, true);
    assert.deepEqual(state.pending, []);
    assert.equal(state.business.conn.user_id, 1);
  }
});

test("Receive looks up unknown connections and leaves the batch unchanged on lookup failure", async (t) => {
  let updates;
  let fail = false;
  const { call, store, calls } = await setup(t, (method, params) => method === "getBusinessConnection" && fail && params.business_connection_id === "unknown"
    ? { ok: false, error_code: 400, description: "Unknown connection" }
    : { ok: true, result: method === "getMe" ? { id: 101, username: "my_bot" }
      : method === "getBusinessConnection" ? { ...connection, id: params.business_connection_id } : updates });
  for (const type of ["edited_business_message", "deleted_business_messages", "business_message"]) {
    await store.write({ offset: 0, chats: {}, pending: [] });
    fail = type === "business_message";
    updates = [{ update_id: 1, [type]: type === "deleted_business_messages"
      ? { business_connection_id: "conn", chat: { id: 7 }, message_ids: [1] } : message(1, 1) }];
    if (fail) updates.push({ update_id: 2, business_message: { ...message(2, 1), business_connection_id: "unknown" } });
    const initial = await store.read();
    const before = calls.filter(({ method }) => method === "getBusinessConnection").length;
    const output = await call("read_new_messages");
    if (fail) {
      assert.equal(output.isError, true);
      assert.deepEqual(await store.read(), initial);
      assert.equal((await store.read()).offset, 0);
    } else assert.match(output, /no new messages/);
    assert.equal(calls.filter(({ method }) => method === "getBusinessConnection").length, before + (fail ? 2 : 1));
    if (fail) {
      fail = false;
      assert.match(await call("read_new_messages"), /no new messages/);
    }
    assert.equal((await store.read()).offset, type === "business_message" ? 3 : 2);
  }
});

test("Business forward uses the bot identity and sends no connection ID", async (t) => {
  const forwarded = { ...message(2) };
  delete forwarded.business_connection_id;
  const { call, store, calls } = await setup(t, () => ({ ok: true, result: forwarded }));
  const state = await store.read();
  addMessage(state, message(1));
  await store.write(state);
  for (const chat_id of ["conn:7", "unknown:7"]) {
    const args = { chat_id, from_chat_id: 8, message_id: 1 };
    const preview = await call("forward_message", args);
    assert.match(preview.notice, /^The bot forwards this as itself\./);
    assert.doesNotMatch(preview.notice, /以你本人的身份/);
    assert.deepEqual(preview.preview.params, { chat_id: 7, from_chat_id: 8, message_id: 1 });
    await call("forward_message", { ...args, confirm: true });
    assert.deepEqual(calls.at(-1), { method: "forwardMessage",
      params: { chat_id: 7, from_chat_id: 8, message_id: 1 } });
  }
});

test("Business delete previews deleteBusinessMessages and removes only the stored business message", async (t) => {
  const { call, store, calls } = await setup(t, () => ({ ok: true, result: true }));
  const state = await store.read();
  addMessage(state, message(1));
  addMessage(state, message(2));
  const normal = { ...message(1) };
  delete normal.business_connection_id;
  addMessage(state, normal);
  await store.write(state);
  const params = { business_connection_id: "conn", message_ids: [1] };
  const preview = await call("delete_message", { chat_id: "conn:7", message_id: 1 });
  assert.equal(preview.sent, false);
  assert.deepEqual(preview.preview, { bot_id: "101", chat: state.chats["conn:7"].chat,
    method: "deleteBusinessMessages", params });
  assert.match(preview.notice, /Show this preview to the user\. Call again with confirm=true after the user agrees\./);
  assert.equal(calls.length, 0);
  assert.deepEqual(await store.read(), state);
  const result = await call("delete_message", { chat_id: "conn:7", message_id: 1, confirm: true });
  assert.equal(result.deleted, true);
  assert.deepEqual(calls, [{ method: "deleteBusinessMessages", params }]);
  const saved = await store.read();
  assert.deepEqual(saved.chats["conn:7"].messages.map((item) => item.message_id), [2]);
  assert.deepEqual(saved.chats[7].messages.map((item) => item.message_id), [1]);
});

test("Business status refreshes known connections and returns missing setup steps safely", async (t) => {
  let can_connect_to_business = false;
  let can_reply = true;
  let is_enabled = true;
  let fail = false;
  const { call, store, calls } = await setup(t, (method) => method === "getMe"
    ? { ok: true, result: { id: 101, username: token, first_name: token,
      can_connect_to_business, can_read_all_group_messages: false } }
    : fail ? { ok: false, error_code: 400, description: token }
      : { ok: true, result: { ...connection, user: { id: 1, first_name: token }, rights: { can_reply }, is_enabled } });
  await store.write({ offset: 0, chats: {}, business: { conn: {} } });
  const info = await call("get_me");
  assert.equal(info.business_connected, true);
  assert.equal(info.can_reply, true);
  assert.equal(info.can_connect_to_business, false);
  assert.ok(info.missing_steps.some((step) => step.includes("Secretary Mode")));
  assert.ok(info.missing_steps.some((step) => step.includes("/setprivacy") && step.includes("移出原来已加入的群")));
  assert.deepEqual(calls[1], { method: "getBusinessConnection", params: { business_connection_id: "conn" } });
  assert.equal((await store.read()).business.conn.user_name, "[REDACTED]");
  can_connect_to_business = true;
  can_reply = false;
  assert.ok((await call("get_me")).missing_steps.some((step) => step.includes("允许回复消息")));
  const before = calls.length;
  const bots = await call("list_bots");
  assert.deepEqual(calls.slice(before).map(({ method }) => method), ["getMe"]);
  assert.equal(bots[0].can_connect_to_business, true);
  assert.equal(bots[0].can_read_all_group_messages, false);
  assert.ok(bots[0].missing_steps.some((step) => step.includes("允许回复消息")));
  is_enabled = false;
  const disabled = await call("get_me");
  assert.equal(disabled.business_connected, false);
  assert.equal(disabled.can_reply, false);
  assert.ok(disabled.missing_steps.some((step) => step.includes("Chatbots")));
  fail = true;
  assert.equal((await call("get_me")).isError, true);
});
