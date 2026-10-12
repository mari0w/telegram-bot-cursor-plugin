import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProxyAgent } from "undici";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";
import { openStore } from "../store.js";

const env = { TELEGRAM_BOT_TOKEN: "101:fake-one", TELEGRAM_BOT_TOKEN_2: "202:fake-two" };
const api = (result) => Response.json({ ok: true, result });
const message = (kind) => ({ message_id: 1, date: 1, chat: { id: 7, type: "private" },
  caption: "Caption", [kind]: kind === "photo" ? [{ file_id: "photo-id", width: 10, height: 10, file_size: 4 }]
    : { file_id: "doc-id", file_name: "file.pdf", file_size: 4 } });

async function setup(t, reply, extraEnv = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telegram-files-chat-"));
  const calls = [];
  const server = createServer({ pollEnabled: false, env: { ...env, ...extraEnv }, dataDir, fetch: async (url, options) => {
    const method = url.split("/").at(-1);
    const params = options.body instanceof FormData ? options.body
      : options.body === undefined ? undefined : JSON.parse(options.body);
    calls.push({ url, method, params, options });
    return reply(calls.at(-1));
  } });
  const client = new Client({ name: "files-chat-test", version: "1.2.0" });
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

for (const [name, method, kind, filename] of [
  ["send_photo", "sendPhoto", "photo", "photo.jpg"],
  ["send_document", "sendDocument", "document", "file.pdf"],
]) test(`${name} previews local size; confirmation uploads FormData and saves file info`, async (t) => {
  const timeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  const { call, calls, dataDir } = await setup(t, () => api(message(kind)));
  const file = path.join(dataDir, filename);
  await writeFile(file, "test");
  const args = { chat_id: 7, file, caption: "Caption", parse_mode: "HTML",
    reply_to_message_id: 3, disable_notification: false };
  const preview = await call(name, args);
  assert.equal(calls.length, 0);
  assert.equal(preview.sent, false);
  assert.equal(preview.preview.method, method);
  assert.deepEqual(preview.preview.source, { kind: "local", file_size: 4 });
  assert.deepEqual(preview.preview.params, { chat_id: 7, [kind]: file, caption: "Caption", parse_mode: "HTML",
    reply_parameters: { message_id: 3 }, disable_notification: false });
  assert.ok(preview.rate_reminder);
  const result = await call(name, { ...args, confirm: true });
  assert.ok(result.rate_reminder);
  assert.equal(calls.length, 1);
  assert.deepEqual(timeout.mock.calls.map(({ arguments: args }) => args), [[120000]]);
  const { params, options } = calls[0];
  assert.equal(calls[0].method, method);
  assert.ok(params instanceof FormData);
  assert.equal(options.headers, undefined);
  assert.equal(params.get("chat_id"), "7");
  assert.equal(params.get("caption"), "Caption");
  assert.equal(params.get("parse_mode"), "HTML");
  assert.equal(params.get("disable_notification"), "false");
  assert.deepEqual(JSON.parse(params.get("reply_parameters")), { message_id: 3 });
  const upload = params.get(kind);
  assert.ok(upload instanceof Blob);
  assert.equal(upload.name, filename);
  assert.equal(await upload.text(), "test");
  const saved = (await openStore(dataDir, 101).read()).chats[7].messages[0];
  assert.deepEqual(saved.file, { kind, file_size: 4, ...(kind === "photo" ? { file_id: "photo-id" }
    : { file_id: "doc-id", file_name: filename }) });
  assert.equal(saved.text, "Caption");
});

test("Local upload limits apply to previews and are checked again before sending", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => assert.fail("Oversize files must not call fetch"));
  const file = path.join(dataDir, "large-file");
  await writeFile(file, "small");
  assert.equal((await call("send_photo", { chat_id: 7, file })).sent, false);
  for (const [name, maxMB] of [["send_photo", 10], ["send_document", 50]]) {
    await truncate(file, maxMB * 1024 * 1024 + 1);
    for (const confirm of [false, true]) {
      const result = await call(name, { chat_id: 7, file, confirm });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, new RegExp(`${maxMB} MB upload limit`));
    }
  }
  assert.equal(calls.length, 0);
});

test("Document URLs and photo file IDs preview their source and send JSON strings", async (t) => {
  const timeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  const { call, calls, dataDir } = await setup(t, ({ method }) => api({
    ...message(method === "sendDocument" ? "document" : "photo"), message_id: method === "sendDocument" ? 1 : 2,
  }));
  for (const [name, field, file, kind] of [
    ["send_document", "document", "https://example.com/file.pdf", "url"],
    ["send_photo", "photo", "telegram-photo-id", "file_id"],
  ]) {
    const args = { chat_id: "7", file, caption: "Caption" };
    const before = calls.length;
    const preview = await call(name, args);
    assert.equal(calls.length, before);
    assert.deepEqual(preview.preview.source, { kind });
    assert.equal(preview.preview.params[field], file);
    const result = await call(name, { ...args, confirm: true });
    assert.ok(result.rate_reminder);
    assert.equal(calls.length, before + 1);
    assert.deepEqual(calls.at(-1).params, { chat_id: "7", [field]: file, caption: "Caption" });
    assert.equal(calls.at(-1).options.headers["content-type"], "application/json");
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(timeout.mock.calls.map(({ arguments: args }) => args), [[15000], [15000]]);
  assert.deepEqual((await openStore(dataDir, 101).read()).chats[7].messages[0].file,
    { kind: "document", file_id: "doc-id", file_name: "file.pdf", file_size: 4 });
});

test("File send results, stored messages, and API errors redact both configured tokens", async (t) => {
  let fail = false;
  const { call, dataDir } = await setup(t, ({ method }) => {
    const caption = Object.values(env).join(" ");
    return fail ? Response.json({ ok: false, error_code: 429, description: caption, parameters: { retry_after: 9 } })
      : api({ ...message(method === "sendPhoto" ? "photo" : "document"), caption });
  });
  for (const name of ["send_photo", "send_document"]) {
    const args = { chat_id: 7, file: "telegram-file-id", confirm: true };
    const result = await call(name, args);
    assert.equal(result.caption, "[REDACTED] [REDACTED]");
    fail = true;
    const error = await call(name, args);
    assert.equal(error.isError, true);
    assert.match(error.content[0].text, /429 \[REDACTED\] \[REDACTED\].*Retry after 9 s/);
    fail = false;
  }
  assert.ok((await openStore(dataDir, 101).read()).chats[7].messages
    .every((message) => message.text === "[REDACTED] [REDACTED]"));
});

test("Download gets file info and saves bytes privately under the selected bot with the same proxy", async (t) => {
  const timeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  const bytes = Buffer.from("file bytes");
  const file = { file_unique_id: "unique-doc", file_size: bytes.length, file_path: "documents/file.pdf" };
  const { call, calls, dataDir } = await setup(t, ({ method }) => method === "getFile" ? api(file) : new Response(bytes),
    { HTTPS_PROXY: "proxy:8080" });
  const result = await call("download_file", { bot: "202", file_id: "doc-id" });
  const localPath = path.join(dataDir, "202/files/unique-doc_file.pdf");
  assert.deepEqual(result, { path: localPath, file_size: bytes.length, file_path: file.file_path });
  assert.ok(!JSON.stringify(result).includes("https://"));
  assert.deepEqual(await readFile(result.path), bytes);
  assert.equal(calls.length, 2);
  assert.deepEqual(timeout.mock.calls.map(({ arguments: args }) => args), [[15000], [120000]]);
  assert.equal(calls[0].method, "getFile");
  assert.deepEqual(calls[0].params, { file_id: "doc-id" });
  assert.equal(calls[1].url, `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN_2}/${file.file_path}`);
  assert.equal(calls[1].options.body, undefined);
  assert.ok(calls[0].options.dispatcher instanceof ProxyAgent);
  assert.equal(calls[1].options.dispatcher, calls[0].options.dispatcher);
  for (const dir of ["202", "202/files"]) assert.equal((await stat(path.join(dataDir, dir))).mode & 0o777, 0o700);
  assert.equal((await stat(result.path)).mode & 0o777, 0o600);
  await assert.rejects(readFile(path.join(dataDir, "202/store.sqlite")), { code: "ENOENT" });
});

test("Download errors redact tokens from fetch messages and causes", async (t) => {
  const { call, calls, dataDir } = await setup(t, ({ method, url }) => {
    if (method === "getFile") return api({ file_unique_id: "unique", file_path: "documents/file.pdf" });
    throw new Error(`failed ${url}`, { cause: new Error(env.TELEGRAM_BOT_TOKEN_2) });
  });
  const result = await call("download_file", { file_id: "doc-id" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /bot\[REDACTED\].*\[REDACTED\]/);
  assert.equal(calls.length, 2);
  assert.deepEqual(await readdir(dataDir), []);
});

test("Download HTTP errors do not save a file and redact the status text", async (t) => {
  const { call, dataDir } = await setup(t, ({ method }) => method === "getFile"
    ? api({ file_unique_id: "unique", file_path: "documents/file.pdf" })
    : new Response("failed", { status: 404, statusText: env.TELEGRAM_BOT_TOKEN }));
  const result = await call("download_file", { file_id: "doc-id" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Telegram file download failed: 404 \[REDACTED\]/);
  assert.deepEqual(await readdir(dataDir), []);
});

test("Chat, administrator, and command reads call their methods and redact results", async (t) => {
  const reply = { value: Object.values(env).join(" ") };
  const { call, calls, dataDir } = await setup(t, () => api(reply));
  for (const [name, method, params] of [
    ["get_chat", "getChat", { chat_id: "@channel" }],
    ["get_chat_admins", "getChatAdministrators", { chat_id: 7 }],
    ["get_commands", "getMyCommands", {}],
  ]) {
    assert.deepEqual(await call(name, params), { value: "[REDACTED] [REDACTED]" });
    assert.equal(calls.at(-1).method, method);
    assert.deepEqual(calls.at(-1).params, params);
  }
  assert.equal(calls.length, 3);
  assert.deepEqual(await readdir(dataDir), []);
});

test("Pins and command changes require confirmation and do not write the store", async (t) => {
  const { call, calls, dataDir } = await setup(t, () => api(true));
  const tools = [
    ["pin_message", "pinChatMessage", { chat_id: 7, message_id: 1, disable_notification: true }],
    ["unpin_message", "unpinChatMessage", { chat_id: 7, message_id: 1 }],
    ["unpin_message", "unpinChatMessage", { chat_id: 7 }],
    ["set_commands", "setMyCommands", { commands: [{ command: "start", description: "Start the bot" }] }],
  ];
  for (const [name, method, params] of tools) {
    const before = calls.length;
    for (const extra of [{}, { confirm: false }]) {
      const preview = await call(name, { ...params, ...extra });
      assert.equal(preview.sent, false);
      assert.equal(preview.preview.method, method);
      assert.deepEqual(preview.preview.params, params);
      assert.match(preview.notice, /confirm=true after the user agrees/);
      assert.equal(calls.length, before);
    }
    assert.equal((await call(name, { ...params, confirm: true })).ok, true);
    assert.equal(calls.at(-1).method, method);
    assert.deepEqual(calls.at(-1).params, params);
  }
  assert.deepEqual(await openStore(dataDir, 101).read(), { offset: 0, chats: {}, pending: [] });
});

test("Command schema enforces 1-32 characters, nonempty descriptions, and at most 100 commands", async (t) => {
  const { call, calls } = await setup(t, () => api(true));
  const command = { command: "a".repeat(32), description: "Description" };
  const commands = Array.from({ length: 100 }, () => command);
  assert.equal((await call("set_commands", { commands, confirm: true })).ok, true);
  for (const invalid of [
    [{ ...command, command: "a".repeat(33) }], [{ ...command, command: "" }],
    [{ ...command, description: "" }], [...commands, command],
  ]) {
    const result = await call("set_commands", { commands: invalid, confirm: true });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Invalid arguments/);
  }
  assert.equal(calls.length, 1);
});
