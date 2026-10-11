import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";
import { addBusinessConnection, openStore } from "../store.js";
import { classify, describeFilterChanges, filterFields, formatMessages, readFilters } from "../filter.js";

const me = { id: "101", username: "my_bot" };
const group = { id: -1001, type: "group", title: "Ops" };
const message = { message_id: 45, date: 1791684360, chat_id: group.id,
  from: { id: 9, username: "Bob", first_name: "Bob" }, text: "hello" };

test("Rule summaries describe only additions and removals with saved names", () => {
  const empty = Object.fromEntries(filterFields.map((key) => [key, []]));
  const chats = { [-1001]: { chat: group, messages: [message] } };
  for (const [key, value, added, removed] of [
    ["exclude_keywords", "查单", "以后包含『查单』的消息不再显示给你。", "恢复显示包含『查单』的消息。"],
    ["include_keywords", "紧急", "群里包含『紧急』的消息完整显示给你。", "取消群里包含『紧急』的消息完整显示的规则。"],
    ["exclude_regex", "order\\s+\\d+", "符合「order\\s+\\d+」这种写法的消息不再显示。", "恢复显示符合「order\\s+\\d+」这种写法的消息。"],
    ["include_regex", "check.*", "符合「check.*」这种写法的消息完整显示。", "取消符合「check.*」这种写法的消息完整显示的规则。"],
    ["block_users", 9, "不再显示 Bob 发的消息。", "恢复显示 Bob 发的消息。"],
    ["allow_users", "@Bob", "完整显示 @Bob 发的群消息。", "取消完整显示 @Bob 发的群消息的规则。"],
    ["mute_chats", -1001, "「Ops」只显示新消息条数。", "取消「Ops」只显示新消息条数的规则。"],
    ["allow_chats", "-1001", "「Ops」的消息全部完整显示。", "取消「Ops」的消息全部完整显示的规则。"],
    ["owner_names", "enoch", "以后把『enoch』当作你的名字：别人 @ 这些名字的消息算给你的。", "『enoch』不再当作你的名字。"],
  ]) {
    const next = { ...empty, [key]: [value] };
    assert.equal(describeFilterChanges(empty, next, chats), added);
    assert.equal(describeFilterChanges(next, empty, chats), removed);
  }
  const current = { ...empty, exclude_keywords: ["保留", "删除"] };
  const next = { ...current, exclude_keywords: ["保留", "新增"] };
  assert.equal(describeFilterChanges(current, next, chats), "以后包含『新增』的消息不再显示给你。\n恢复显示包含『删除』的消息。");
  assert.equal(describeFilterChanges(current, current, chats), "");
  assert.equal(describeFilterChanges(empty, { ...empty, block_users: [88], allow_chats: [99] }, chats),
    "「99」的消息全部完整显示。\n不再显示 88 发的消息。");
});

test("Combined exclusions require every condition and keep protected text and messages for the owner", () => {
  const owner = { ...me, owner_ids: [1], owner_usernames: ["owner"] };
  const combined = { words: ["order", "check"], pattern: "\\d+", chats: [group.id], users: ["@bob"] };
  for (const [text, chat, changes, rules, expected] of [
    ["ORDER check 123", group, {}, { exclude_rules: [combined] }, "filtered"],
    ["order 123", group, {}, { exclude_rules: [combined] }, "summary"],
    ["check 123", group, {}, { exclude_rules: [combined] }, "summary"],
    ["order check", group, {}, { exclude_rules: [combined] }, "summary"],
    ["order check 123", { ...group, id: -2 }, {}, { exclude_rules: [combined] }, "summary"],
    ["order check 123", group, { from: { id: 8 } }, { exclude_rules: [combined] }, "summary"],
    ["order check 123", group, {}, { exclude_rules: [{ ...combined, users: [9] }] }, "filtered"],
    ["订单 投诉", group, {}, { exclude_keywords: ["订单"] }, "summary"],
    ["订单 退款", group, {}, { exclude_regex: ["订单"] }, "summary"],
    ["订单 急", group, {}, { exclude_rules: [{ words: ["订单"], include_for_me: true }] }, "summary"],
    ["订单", { id: 7, type: "private" }, {}, { exclude_keywords: ["订单"], exclude_regex: ["订单"] }, "full"],
    ["订单", { id: 7, type: "private" }, {}, { exclude_rules: [{ words: ["订单"] }] }, "full"],
    ["订单", { id: 7, type: "private" }, { business_connection_id: "conn" },
      { exclude_rules: [{ words: ["订单"], include_for_me: true }] }, "filtered"],
    ["订单 投诉", { id: 7, type: "private" }, {},
      { exclude_rules: [{ words: ["订单"], include_for_me: true }] }, "full"],
    ["订单", group, { reply_to_from_id: 1 }, { exclude_keywords: ["订单"] }, "full"],
    ["@OWNER 订单", group, {}, { exclude_regex: ["订单"] }, "full"],
    ["@MY_BOT 订单", group, {}, { exclude_rules: [{ words: ["订单"] }] }, "full"],
    ["订单 投诉", group, {}, { exclude_keywords: ["订单"], block_users: [9] }, "filtered"],
    ["订单 投诉", group, {}, { exclude_keywords: ["订单"], protected_words: [] }, "filtered"],
  ]) assert.equal(classify({ ...message, text, ...changes }, chat, rules, owner, "for_me"), expected, text);
});

const env = { TELEGRAM_BOT_TOKEN: "101:filter-secret", TELEGRAM_BOT_TOKEN_2: "202:filter-secret-two" };
const connection = { id: "conn", user: { id: 1, username: "owner" }, user_chat_id: 1,
  rights: { can_reply: true }, is_enabled: true, date: 1 };

async function setup(t, reply) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-filter-"));
  const server = createServer({ env, dataDir, fetch: async (url, options) => Response.json({ ok: true,
    result: reply(url.split("/").at(-1), JSON.parse(options.body)) }) });
  const client = new Client({ name: "filter-test", version: "1.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { store: openStore(dataDir, 101), call: async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    for (const token of Object.values(env)) assert.ok(!JSON.stringify(result).includes(token));
    return result;
  } };
}

test("Filter defaults, preview mistakes, pattern validation, and saved results do not leak tokens", async (t) => {
  const { call, store } = await setup(t, (method) => {
    assert.equal(method, "getMe");
    return me;
  });
  assert.deepEqual((await readFilters(store.dir)).protected_words, ["投诉", "退款", "急"]);
  assert.deepEqual((await readFilters(store.dir)).owner_names, []);
  const texts = ["订单 查单", `订单 查单 ${"长".repeat(101)} ${Object.values(env).join(" ")}`,
    "订单 查单？", "订单 查单 投诉"];
  await store.write({ offset: 0, chats: {
    [group.id]: { chat: group, messages: texts.map((text, i) => ({ ...message, text, message_id: i + 1 })) },
    7: { chat: { id: 7, type: "private", first_name: "李四" }, messages: [{ ...message, chat_id: 7, text: "订单 查单" }] },
  } });
  await writeFile(path.join(store.dir, "filters.json"), JSON.stringify({ exclude_keywords: [] }));
  assert.deepEqual(JSON.parse((await call("get_filters")).content[0].text).protected_words, ["投诉", "退款", "急"]);
  const fields = { exclude_rules: [{ words: ["订单", "查单"], chats: [group.id], users: [9] }] };
  const preview = (await call("set_filters", fields)).content[0].text;
  assert.match(preview, /同时包含『订单』『查单』的消息（只在『Ops』）（只针对 Bob）不再显示给你/);
  assert.match(preview, /按现在已保存的消息算，会多收起 3 条。/);
  const mistakes = preview.split("可能误收的消息（请看一下）：\n")[1].split("\n要保存")[0].split("\n");
  assert.equal(mistakes.length, 2);
  assert.ok(mistakes.every((line) => line.startsWith("Bob（Ops）：") && Array.from(line.split("：")[1]).length <= 61));
  assert.match(preview, /Point out the messages that might be hidden by mistake\./);
  assert.deepEqual((await readFilters(store.dir)).exclude_rules, []);
  const privatePreview = (await call("set_filters", { exclude_rules: [
    { words: ["订单"], chats: [7], include_for_me: true },
  ] })).content[0].text;
  assert.match(privatePreview, /私聊和@你的消息也会收起/);
  assert.match(privatePreview, /可能误收的消息（请看一下）：\nBob（李四）：订单 查单/);
  const saved = (await call("set_filters", { ...fields, confirm: true })).content[0].text;
  assert.match(saved, /^已保存。/);
  assert.match(saved, /如果有消息被误收，直接告诉我，我再改规则（改之前也会先问你）。$/);
  assert.deepEqual((await readFilters(store.dir)).exclude_rules, fields.exclude_rules);
  const invalid = await call("set_filters", { exclude_rules: [{ pattern: `[${env.TELEGRAM_BOT_TOKEN}` }], confirm: true });
  assert.equal(invalid.isError, true);
  assert.deepEqual((await readFilters(store.dir)).exclude_rules, fields.exclude_rules);
  const history = (await call("get_chat_messages", { chat_id: group.id })).content[0].text;
  assert.match(history, /订单 查单 投诉/);
  assert.match(history, /已收起 3 条。Set show_filtered=true to view them\./);
  const protectedPreview = (await call("set_filters", { protected_words: ["投诉", "保留"] })).content[0].text;
  assert.match(protectedPreview, /包含『保留』的消息一定显示给你/);
  assert.match(protectedPreview, /『退款』不再是一定显示的词/);
});

test("Known business owners are protected in new messages, saved history, and previews", async (t) => {
  const updates = ["@OWNER 订单", "订单 reply", "订单"].map((text, i) => ({ update_id: i + 1, message: {
    message_id: i + 1, date: 1, chat: group, from: message.from, text,
    ...(i === 1 ? { reply_to_message: { message_id: 1, from: { id: 1 } } } : {}),
  } }));
  const { call, store } = await setup(t, (method) => method === "getMe" ? me : updates);
  const state = { offset: 0, chats: {} };
  addBusinessConnection(state, connection);
  assert.equal(state.business.conn.user_username, "owner");
  await store.write(state);
  await call("set_filters", { exclude_keywords: ["订单"], confirm: true });
  const fresh = (await call("read_new_messages")).content[0].text;
  assert.match(fresh, /@OWNER 订单/);
  assert.match(fresh, /订单 reply/);
  assert.match(fresh, /已收起 1 条。Call get_chat_messages with show_filtered=true to view them\./);
  const history = (await call("get_chat_messages", { chat_id: group.id })).content[0].text;
  assert.match(history, /@OWNER 订单/);
  assert.match(history, /订单 reply/);
  const preview = (await call("set_filters", { exclude_rules: [{ words: ["订单"] }] })).content[0].text;
  assert.match(preview, /按现在已保存的消息算，没有消息会被收起。/);
  assert.doesNotMatch(preview, /可能误收的消息/);
});

test("An owner without a username is not matched by a first name mention in a group", async (t) => {
  const updates = [{ update_id: 1, message: {
    message_id: 1, date: 1, chat: group, from: message.from, text: "@Alice 订单",
  } }];
  const { call, store } = await setup(t, (method) => method === "getMe" ? me : updates);
  const state = { offset: 0, chats: {} };
  addBusinessConnection(state, { ...connection, user: { id: 1, first_name: "Alice" } });
  assert.equal(state.business.conn.user_name, "Alice");
  assert.equal(state.business.conn.user_username, undefined);
  await store.write(state);
  await call("set_filters", { exclude_keywords: ["订单"], confirm: true });
  const fresh = (await call("read_new_messages")).content[0].text;
  assert.doesNotMatch(fresh, /@Alice/);
  assert.match(fresh, /已收起 1 条/);
  const history = (await call("get_chat_messages", { chat_id: group.id })).content[0].text;
  assert.doesNotMatch(history, /@Alice/);
  assert.match(history, /已收起 1 条/);
});

test("get_me returns the first missing setup step and the done text", async (t) => {
  let privacy = false;
  const { call, store } = await setup(t, (method) => method === "getMe"
    ? { ...me, first_name: env.TELEGRAM_BOT_TOKEN, can_connect_to_business: true, can_read_all_group_messages: privacy }
    : connection);
  const state = { offset: 0, chats: {} };
  addBusinessConnection(state, connection);
  await store.write(state);
  const missing = JSON.parse((await call("get_me")).content[0].text);
  assert.equal(missing.missing_steps.length, 1);
  assert.equal(missing.next_step, missing.missing_steps[0]);
  assert.match(missing.next_step, /@BotFather.*\/setprivacy.*选择这个机器人.*Disable.*再加回群/);
  privacy = true;
  const done = JSON.parse((await call("get_me")).content[0].text);
  assert.deepEqual(done.missing_steps, []);
  assert.equal(done.next_step, "设置已完成。可以把机器人加进需要的群，然后让我读新消息，或每天给你总结和待办。");
  const bots = JSON.parse((await call("list_bots")).content[0].text);
  assert.equal(bots[0].next_step, done.next_step);
});

test("Classify messages in rule order", () => {
  for (const [name, changes, chat, rules, expected] of [
    ["private", {}, { id: 7, type: "private" }, {}, "full"],
    ["mention", { text: "@MY_BOT check this" }, group, {}, "full"],
    ["reply", { reply_to_from_id: 101 }, group, {}, "full"],
    ["plain group", {}, group, {}, "summary"],
    ["allowed chat", {}, group, { allow_chats: ["-1001"] }, "full"],
    ["muted mention", { text: "@my_bot" }, group, { mute_chats: [-1001], allow_chats: [-1001] }, "summary"],
    ["excluded keyword", { text: "查订单" }, group, { exclude_keywords: ["订单"] }, "filtered"],
    ["excluded regex", { text: "ORDER 123" }, group, { exclude_regex: ["order\\s+\\d+"] }, "filtered"],
    ["included keyword", { text: "Please CHECK" }, group, { include_keywords: ["check"] }, "full"],
    ["included regex", { text: "CHECK 123" }, group, { include_regex: ["check\\s+\\d+"] }, "full"],
    ["blocked ID", {}, group, { block_users: ["9"], allow_users: [9] }, "filtered"],
    ["blocked username", {}, group, { block_users: ["@BOB"] }, "filtered"],
    ["allowed username", {}, group, { allow_users: ["@bOB"] }, "full"],
    ["allowed username without @", {}, group, { allow_users: ["bob"] }, "full"],
    ["service", { service: true }, group, { allow_chats: [-1001] }, "filtered"],
    ["sticker", { file: { kind: "sticker" } }, { id: 7, type: "private" }, {}, "filtered"],
  ]) assert.equal(classify({ ...message, ...changes }, chat, rules, me, "for_me"), expected, name);
});

test("For-me mentions use owner names and Business replies use the owner ID", () => {
  const owner = { ...me, owner_ids: [1], owner_usernames: ["owner"] };
  for (const [text, changes, rules, expected] of [
    ["@enoch 看一下", {}, { owner_names: ["enoch"] }, "full"],
    ["@enoch 看一下", {}, { owner_names: ["@EnOcH"] }, "full"],
    ["@enoch 看一下", {}, { owner_names: [] }, "summary"],
    ["@张三 看一下", {}, { owner_names: ["张三"] }, "full"],
    ["enoch 看一下", {}, { owner_names: ["enoch"] }, "summary"],
    ["@OWNER 看一下", {}, { owner_names: [] }, "full"],
    ["看一下", { reply_to_from_id: 1 }, { owner_names: [] }, "full"],
    ["看一下", { reply_to_from_id: 9 }, { owner_names: ["Bob"] }, "summary"],
  ]) assert.equal(classify({ ...message, text, ...changes }, group, rules, owner, "for_me"), expected, text);
});

test("Owner names need confirmation; empty names add hints for each for-me read and mode preview", async (t) => {
  let id = 0;
  const { call, store } = await setup(t, (method) => method === "getMe" ? me : [
    { update_id: ++id, business_connection: connection },
    { update_id: ++id, message: { message_id: id, date: id, chat: group, text: "@enoch 看一下" } },
    { update_id: ++id, message: { message_id: id, date: id, chat: group, text: "回复你",
      reply_to_message: { message_id: 1, from: { id: 1 } } } },
  ]);
  const read = async (args) => (await call("read_new_messages", args)).content[0].text;
  const hint = "AI: owner_names is empty. Ask the owner in plain words for their Telegram username. "
    + "Suggested value: @owner. Ask the owner to confirm it, then save it with set_filters (preview first).";
  const preview = (await call("set_filters", { owner_names: ["enoch"] })).content[0].text;
  assert.match(preview, /以后把『enoch』当作你的名字：别人 @ 这些名字的消息算给你的。/);
  assert.deepEqual((await readFilters(store.dir)).owner_names, []);
  const empty = await read({ mode: "for_me" });
  assert.doesNotMatch(empty, /@enoch 看一下/);
  assert.match(empty, /\[group\] Ops .*回复你/);
  assert.match(empty, /Group summary:\n- Ops .*1 new/);
  assert.equal(empty.split("\n").at(-1), hint);
  const modePreview = (await call("set_filters", { default_mode: "for_me" })).content[0].text;
  assert.match(modePreview, /还没有设置你的 Telegram 用户名，@你 的消息可能认不出来。/);
  assert.equal(modePreview.split("\n").at(-1), hint);
  await call("set_filters", { default_mode: "for_me", confirm: true });
  assert.equal((await read()).split("\n").at(-1), hint);
  assert.doesNotMatch(await read({ mode: "all" }), /AI: owner_names/);
  const namesPreview = (await call("set_filters", { default_mode: "all", owner_names: ["enoch"] })).content[0].text;
  assert.doesNotMatch(namesPreview, /AI: owner_names|还没有设置/);
  await call("set_filters", { owner_names: ["enoch"], confirm: true });
  assert.deepEqual(JSON.parse((await call("get_filters")).content[0].text).owner_names, ["enoch"]);
  const full = await read();
  assert.match(full, /\[group\] Ops .*@enoch 看一下/);
  assert.doesNotMatch(full, /AI: owner_names|Group summary/);
  const invalid = await call("set_filters", { owner_names: [1], confirm: true });
  assert.equal(invalid.isError, true);
  assert.deepEqual((await readFilters(store.dir)).owner_names, ["enoch"]);
  const removal = (await call("set_filters", { owner_names: [] })).content[0].text;
  assert.match(removal, /『enoch』不再当作你的名字。/);
  assert.deepEqual((await readFilters(store.dir)).owner_names, ["enoch"]);
});

test("Empty for-me reads ask for names without a Business username suggestion", () => {
  const hint = "AI: owner_names is empty. Ask the owner in plain words for their Telegram username. "
    + "Ask the owner to confirm it, then save it with set_filters (preview first).";
  const args = { bot_id: 101, messages: [], rules: { default_mode: "for_me" }, me: { owner_ids: [1] }, more: true };
  const output = formatMessages(args);
  assert.match(output, /^bot 101: no new messages\.\nMore updates are waiting\./);
  assert.equal(output.split("\n").at(-1), hint);
  assert.doesNotMatch(output, /Suggested value/);
  assert.doesNotMatch(formatMessages({ ...args, rules: { owner_names: ["enoch"] }, mode: "for_me" }), /AI:/);
  assert.doesNotMatch(formatMessages({ ...args, mode: "all" }), /AI:/);
});

test("Owner name previews and Business username hints redact tokens", async (t) => {
  const { call, store } = await setup(t, (method) => method === "getMe" ? me : []);
  const state = { offset: 0, chats: {} };
  addBusinessConnection(state, { ...connection, user: { id: 1, username: env.TELEGRAM_BOT_TOKEN } });
  await store.write(state);
  const names = (await call("set_filters", { owner_names: [env.TELEGRAM_BOT_TOKEN_2] })).content[0].text;
  assert.match(names, /以后把『\[REDACTED\]』当作你的名字/);
  const preview = (await call("set_filters", { default_mode: "for_me" })).content[0].text;
  assert.match(preview, /Suggested value: @\[REDACTED\]/);
  const read = (await call("read_new_messages", { mode: "for_me" })).content[0].text;
  assert.match(read, /no new messages/);
  assert.match(read, /Suggested value: @\[REDACTED\]/);
});

test("Format compact lines, summaries, and filtered counts", () => {
  const privateChat = { id: 7, type: "private", first_name: "Alice", last_name: "Smith" };
  const output = formatMessages({ bot_id: 101, offset: 120, me, rules: {}, more: true, mode: "for_me",
    chats: { 7: { chat: privateChat }, [-1001]: { chat: group } }, messages: [
      { ...message, chat_id: 7, text: "a".repeat(501), edited: true,
        reply_to_message_id: 44, file: { kind: "document", file_name: "file.pdf", file_id: "doc-id" } },
      { ...message, text: "group text", date: 1791685800 },
      { ...message, text: "older group text" },
      { ...message, service: true },
      { ...message, chat_id: 7, text: "hello\nworld", file: { kind: "photo", file_id: "photo-id" } },
    ] });
  assert.ok(output.includes("a".repeat(500) + "…"));
  assert.ok(!output.includes("a".repeat(501)));
  assert.match(output, /\[private\] Alice Smith \(chat 7\) #45 .*@Bob \(reply to #44\) \(edited\): \[document file.pdf id=doc-id\]/);
  assert.match(output, /\[photo id=photo-id\] hello world/);
  assert.match(output, /Group summary:\n- Ops \(chat -1001\): 2 new, last 2026-10-11 02:30Z/);
  assert.doesNotMatch(output, /group text/);
  assert.match(output, /已收起 1 条。Call get_chat_messages with show_filtered=true to view them\./);
  assert.match(output, /More updates are waiting\. Call read_new_messages again\./);
  const all = formatMessages({ bot_id: 101, offset: 120, me, rules: {}, mode: "all",
    chats: { [-1001]: { chat: group } }, messages: [{ ...message, service: true }, message] });
  assert.equal(all.split("\n").length, 3);
  assert.match(all, /@Bob: hello/);
  assert.match(all, /已收起 1 条/);
  assert.doesNotMatch(all, /Group summary|service message/);
  assert.equal(formatMessages({ bot_id: 101, messages: [] }), "bot 101: no new messages.");
});

test("Read modes keep muted summaries and change the saved default only after confirmation", async (t) => {
  const muted = { id: -1002, type: "group", title: "Muted" };
  let id = 0;
  const { call, store } = await setup(t, (method) => method === "getMe" ? me : [
    { update_id: ++id, message: { message_id: id, date: id, chat: group, text: "plain group message" } },
    { update_id: ++id, message: { message_id: id, date: id, chat: muted, text: "muted message" } },
  ]);
  await call("set_filters", { mute_chats: [muted.id], confirm: true });
  const read = async (args) => (await call("read_new_messages", args)).content[0].text;
  const full = await read();
  assert.match(full, /\[group\] Ops .*plain group message/);
  assert.match(full, /Group summary:\n- Muted .*1 new/);
  assert.doesNotMatch(full, /muted message|\n- Ops/);
  const forMe = await read({ mode: "for_me" });
  assert.match(forMe, /Group summary:\n- Ops .*1 new.*\n- Muted .*1 new/);
  assert.doesNotMatch(forMe, /plain group message|muted message/);
  const preview = (await call("set_filters", { default_mode: "for_me" })).content[0].text;
  assert.match(preview, /^以后默认只完整显示给你的消息（私聊、@你、回复你），其他群消息只显示条数。/);
  assert.equal((await readFilters(store.dir)).default_mode, "all");
  assert.match(await read(), /plain group message/);
  await call("set_filters", { default_mode: "for_me", confirm: true });
  assert.equal(JSON.parse((await call("get_filters")).content[0].text).default_mode, "for_me");
  assert.doesNotMatch(await read(), /plain group message/);
  assert.match(await read({ mode: "all" }), /plain group message/);
  assert.match((await call("set_filters", { default_mode: "all" })).content[0].text,
    /^以后默认显示所有消息的全文。/);
});

test("Message context shows the original reply and nearby saved messages with filters", async (t) => {
  const { call, store } = await setup(t, (method) => {
    assert.equal(method, "getMe");
    return me;
  });
  const messages = Array.from({ length: 15 }, (_, i) => ({ ...message, message_id: i + 1,
    text: i === 0 ? `Original ${Object.values(env).join(" ")}` : i === 3 ? "hidden" : `Message ${i + 1}`,
    ...(i === 7 ? { reply_to_message_id: 1 } : {}),
  }));
  await store.write({ offset: 0, pending: [...messages.map((item) => [String(group.id), item.message_id]), ["7", 1]], chats: {
    [group.id]: { chat: group, messages: [...messages].reverse() },
    7: { chat: { id: 7, type: "private" }, messages: [{ ...message, message_id: 1, text: "Other chat" }] },
  } });
  await call("set_filters", { exclude_keywords: ["hidden"], confirm: true });
  const read = async (args = {}) => (await call("get_chat_messages", {
    chat_id: group.id, message_id: 8, limit: 1, before_message_id: 3, ...args,
  })).content[0].text;
  const ids = (text) => [...text.matchAll(/ #(\d+) /g)].map((match) => Number(match[1]));
  const output = await read();
  assert.match(output, /^原消息：\[group\] Ops .*Original \[REDACTED\] \[REDACTED\]/);
  assert.deepEqual(ids(output), [1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.match(output, /\n→ \[group\] Ops .*#8 .*Message 8/);
  assert.match(output, /已收起 1 条/);
  assert.doesNotMatch(output, /hidden|Other chat/);
  assert.deepEqual((await store.read()).pending, [2, 4, 14, 15].map((id) => [String(group.id), id]).concat([["7", 1]]));
  assert.deepEqual(ids(await read({ context: 1 })), [1, 7, 8, 9]);
  assert.doesNotMatch(await read({ context: 7, show_filtered: true }), /原消息：/);
  assert.deepEqual(ids(await read({ show_filtered: true })), [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  await call("set_filters", { exclude_keywords: ["Original"], confirm: true });
  assert.doesNotMatch(await read({ context: 0 }), /原消息：|Original/);
  assert.match(await read({ context: 0, show_filtered: true }), /^原消息：/);
  messages[7].reply_to_message_id = 99;
  await store.write({ offset: 0, chats: { [group.id]: { chat: group, messages } } });
  const missing = await read({ context: 0 });
  assert.match(missing, /^原消息没有保存在本地。\n→ /);
  assert.deepEqual(ids(missing), [8]);
});
