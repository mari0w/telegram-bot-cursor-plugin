import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProxyAgent } from "undici";
import { callApi, downloadFile, errorMessage, redact, resetProxyPreferenceForTests } from "../telegram.js";
const token = "101:fake-token";
beforeEach(resetProxyPreferenceForTests);

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
  assert.equal(dispatchers.length, 4);
});

test("Retry a proxy connection failure once and use direct connections after success", async (t) => {
  for (const error of [new DOMException("aborted", "AbortError"), new DOMException("expired", "TimeoutError"),
    new Error("request failed", { cause: new Error("ECONNRESET") })]) {
    resetProxyPreferenceForTests();
    const fetch = t.mock.fn(async () => ({ json: async () => ({ ok: true, result: 101 }) }));
    fetch.mock.mockImplementationOnce(async () => { throw error; });
    const options = { fetch, env: { HTTPS_PROXY: "proxy:8080" } };
    assert.equal(await callApi(token, "getMe", {}, options), 101);
    assert.equal(await callApi(token, "getMe", {}, options), 101);
    const calls = fetch.mock.calls.map(({ arguments: args }) => args);
    assert.equal(calls.length, 3);
    assert.ok(calls[0][1].dispatcher instanceof ProxyAgent);
    for (const [url, request] of calls.slice(1)) {
      assert.equal(url, calls[0][0]);
      assert.equal(request.body, calls[0][1].body);
      assert.ok(!Object.hasOwn(request, "dispatcher"));
      assert.notEqual(request.signal, calls[0][1].signal);
    }
  }
});

test("Do not retry Telegram API errors through a proxy; redact the token", async (t) => {
  const fetch = t.mock.fn(async () => ({ json: async () => ({
    ok: false, error_code: 500, description: `socket timeout ${token}`,
  }) }));
  await assert.rejects(callApi(token, "getMe", {}, { fetch, env: { HTTPS_PROXY: "proxy:8080" } }),
    { message: "Telegram API getMe failed: 500 socket timeout [REDACTED]", code: 500 });
  assert.equal(fetch.mock.callCount(), 1);
  assert.ok(fetch.mock.calls[0].arguments[1].dispatcher instanceof ProxyAgent);
});

test("Only allowlisted read methods retry proxy failures", async (t) => {
  for (const method of ["getUpdates", "getMe", "getFile", "getChat", "getChatAdministrators",
    "getMyCommands", "getWebhookInfo", "getBusinessConnection"]) {
    resetProxyPreferenceForTests();
    const fetch = t.mock.fn(async () => ({ json: async () => ({ ok: true, result: [] }) }));
    fetch.mock.mockImplementationOnce(async () => { throw new DOMException("expired", "TimeoutError"); });
    assert.deepEqual(await callApi(token, method, {}, { fetch, env: { HTTPS_PROXY: "proxy:8080" } }), []);
    assert.equal(fetch.mock.callCount(), 2, method);
    assert.ok(fetch.mock.calls[0].arguments[1].dispatcher instanceof ProxyAgent);
    assert.ok(!Object.hasOwn(fetch.mock.calls[1].arguments[1], "dispatcher"));
  }
  for (const method of ["sendMessage", "editMessageText", "deleteMessage", "deleteBusinessMessages",
    "forwardMessage", "pinChatMessage", "unpinChatMessage", "setMyCommands", "sendPhoto",
    "sendDocument", "deleteWebhook", "unknownMethod"]) {
    for (const error of [new DOMException("expired", "TimeoutError"), new Error("ECONNRESET")]) {
      resetProxyPreferenceForTests();
      const fetch = t.mock.fn(async () => { throw error; });
      await assert.rejects(callApi(token, method, {}, { fetch, env: { HTTPS_PROXY: "proxy:8080" } }),
        { message: error.message });
      assert.equal(fetch.mock.callCount(), 1, method);
      assert.ok(fetch.mock.calls[0].arguments[1].dispatcher instanceof ProxyAgent);
    }
  }
});

test("Retry file downloads with a direct connection", async (t) => {
  const fetch = t.mock.fn(async () => ({ ok: true, arrayBuffer: async () => Uint8Array.of(1, 2).buffer }));
  fetch.mock.mockImplementationOnce(async () => { throw new Error("fetch failed"); });
  const options = { fetch, env: { HTTPS_PROXY: "proxy:8080" } };
  assert.deepEqual(await downloadFile(token, "file.txt", options), Buffer.from([1, 2]));
  assert.equal(fetch.mock.callCount(), 2);
  assert.ok(fetch.mock.calls[0].arguments[1].dispatcher instanceof ProxyAgent);
  assert.ok(!Object.hasOwn(fetch.mock.calls[1].arguments[1], "dispatcher"));
  assert.equal(fetch.mock.calls[0].arguments[0], fetch.mock.calls[1].arguments[0]);
  await downloadFile(token, "file.txt", options);
  assert.equal(fetch.mock.callCount(), 3);
  assert.ok(!Object.hasOwn(fetch.mock.calls[2].arguments[1], "dispatcher"));
});

test("A failed direct response body keeps the proxy preference", async (t) => {
  for (const download of [false, true]) {
    resetProxyPreferenceForTests();
    const fetch = t.mock.fn(async () => ({
      ok: true,
      json: async () => { throw new Error("body failed"); },
      arrayBuffer: async () => { throw new Error("body failed"); },
    }));
    fetch.mock.mockImplementationOnce(async () => { throw new DOMException("expired", "TimeoutError"); });
    const options = { fetch, env: { HTTPS_PROXY: "proxy:8080" } };
    await assert.rejects(download ? downloadFile(token, "file.txt", options)
      : callApi(token, "getMe", {}, options), { message: "body failed" });
    assert.equal(fetch.mock.callCount(), 2);
    assert.ok(!Object.hasOwn(fetch.mock.calls[1].arguments[1], "dispatcher"));
    fetch.mock.mockImplementation(async () => ({ json: async () => ({ ok: true, result: 101 }) }));
    await callApi(token, "getMe", {}, options);
    assert.ok(fetch.mock.calls[2].arguments[1].dispatcher instanceof ProxyAgent);
  }
});

test("A failed direct retry keeps the proxy preference and redacts the token", async (t) => {
  const fetch = t.mock.fn(async () => { throw new Error(`fetch failed ${token}`); });
  const options = { fetch, env: { HTTPS_PROXY: "proxy:8080" } };
  await assert.rejects(callApi(token, "getMe", {}, options), { message: "fetch failed [REDACTED]" });
  assert.equal(fetch.mock.callCount(), 2);
  assert.ok(!Object.hasOwn(fetch.mock.calls[1].arguments[1], "dispatcher"));
  fetch.mock.mockImplementation(async () => ({ json: async () => ({ ok: true, result: 101 }) }));
  await callApi(token, "getMe", {}, options);
  assert.ok(fetch.mock.calls[2].arguments[1].dispatcher instanceof ProxyAgent);
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

test("Redact encoded configured and unconfigured tokens, including lowercase %3a", () => {
  const encoded = encodeURIComponent(token);
  const other = encodeURIComponent(`999:${"a".repeat(30)}`);
  assert.equal(redact(`configured ${encoded}; other ${other} ${other.replace("%3A", "%3a")}`, [token]),
    "configured [REDACTED]; other [REDACTED] [REDACTED]");
});

test("API calls and file downloads default to a 15-second timeout", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(AbortSignal, "timeout", (ms) => { assert.equal(ms, 15000); return signal; });
  const fetch = async (url, options) => {
    assert.equal(options.signal, signal);
    return { ok: true, json: async () => ({ ok: true, result: [] }), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  await callApi(token, "getMe", {}, { env: {}, fetch });
  await downloadFile(token, "file.txt", { env: {}, fetch });
});

test("An explicit request timeout sets the fetch signal", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(AbortSignal, "timeout", (ms) => { assert.equal(ms, 12000); return signal; });
  await callApi(token, "getUpdates", {}, { env: {}, timeoutMs: 12000, fetch: async (url, options) => {
    assert.equal(options.signal, signal);
    return { json: async () => ({ ok: true, result: [] }) };
  } });
});
