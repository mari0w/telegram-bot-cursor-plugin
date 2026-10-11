import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";

test("Tools return safe fields, cache usernames, and return redacted errors", async (t) => {
  const env = { TELEGRAM_BOT_TOKEN: "101:fake-one", TELEGRAM_BOT_TOKEN_2: "202:fake-two" };
  let calls = 0;
  let fail = false;
  const server = createServer({ env, fetch: async (url) => {
    calls++;
    if (fail) throw new Error(Object.values(env).join(" "));
    const id = url.includes(env.TELEGRAM_BOT_TOKEN_2) ? 202 : 101;
    return { json: async () => ({ ok: true, result: { id, username: `bot_${id}`, first_name: "Bot",
      can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
      token: env.TELEGRAM_BOT_TOKEN } }) };
  } });
  const client = new Client({ name: "test", version: "0.3.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    for (const token of Object.values(env)) assert.ok(!JSON.stringify(result).includes(token));
    return result;
  };
  const data = (result) => JSON.parse(result.content[0].text);
  assert.deepEqual(data(await call("list_bots")), [
    { number: 1, id: "101", default: true, username: "bot_101", first_name: "Bot", ok: true },
    { number: 2, id: "202", default: false, username: "bot_202", first_name: "Bot", ok: true },
  ]);
  assert.deepEqual(data(await call("get_me", { bot: "@BOT_202" })), {
    id: 202, username: "bot_202", first_name: "Bot", can_join_groups: true,
    can_read_all_group_messages: false, supports_inline_queries: false, number: 2, default: false,
  });
  assert.equal(calls, 3);
  assert.equal(data(await call("get_me")).default, true);
  const unknown = await call("get_me", { bot: "unknown" });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /Unknown bot.*101, 202/);
  assert.equal(calls, 4);
  fail = true;
  assert.equal((await call("get_me")).isError, true);
  assert.ok(data(await call("list_bots")).every((bot) => !bot.ok && bot.error.includes("[REDACTED]")));
});
