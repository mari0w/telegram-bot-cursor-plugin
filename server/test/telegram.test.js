import test from "node:test";
import assert from "node:assert/strict";
import { ProxyAgent } from "undici";
import { callApi, errorMessage, redact } from "../telegram.js";
const token = "101:fake-token";

test("POST JSON to the method; use and reuse a dispatcher only with a proxy", async () => {
  const dispatchers = [];
  const fetch = async (url, options) => {
    assert.equal(url, `https://api.telegram.org/bot${token}/getMe`);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["content-type"], "application/json");
    assert.equal(options.body, "{}");
    dispatchers.push(options.dispatcher);
    if (!options.dispatcher) assert.ok(!Object.hasOwn(options, "dispatcher"));
    return { json: async () => ({ ok: true, result: { id: 101 } }) };
  };
  for (const env of [{}, { HTTPS_PROXY: "proxy:8080", NO_PROXY: "*" }, { HTTPS_PROXY: "proxy:8080" }, {}]) {
    assert.deepEqual(await callApi(token, "getMe", {}, { fetch, env }), { id: 101 });
  }
  assert.ok(dispatchers[1] instanceof ProxyAgent);
  assert.equal(dispatchers[1], dispatchers[2]);
  assert.equal(dispatchers[0], undefined);
  assert.equal(dispatchers[3], undefined);
});

test("Redact API errors, network messages and causes, and unconfigured tokens", async () => {
  const error = new Error(`failed ${token}`, { cause: new Error(`URL /bot${token}/getMe`) });
  assert.equal(errorMessage(error, [token]), "failed [REDACTED]: URL /bot[REDACTED]/getMe");
  assert.equal(redact(`other 999:${"a".repeat(30)}`, []), "other [REDACTED]");
  for (const fetch of [async () => { throw error; }, async () => ({ json: async () => ({
    ok: false, error_code: 429, description: `blocked ${token}`, parameters: { retry_after: 9 },
  }) })]) {
    await assert.rejects(callApi(token, "getMe", {}, { fetch, env: {} }), (caught) => {
      assert.ok(!caught.message.includes(token));
      assert.equal(caught.cause, undefined);
      if (caught.message.includes("429")) assert.equal(caught.code, 429);
      if (caught.message.includes("429")) assert.match(caught.message, /Telegram API getMe failed: 429 .*Retry after 9 s\. Stop sending\. Do not retry at once\./);
      return true;
    });
  }
});

test("An optional request timeout sets the fetch signal", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(AbortSignal, "timeout", (ms) => { assert.equal(ms, 12000); return signal; });
  await callApi(token, "getUpdates", {}, { env: {}, timeoutMs: 12000, fetch: async (url, options) => {
    assert.equal(options.signal, signal);
    return { json: async () => ({ ok: true, result: [] }) };
  } });
});
