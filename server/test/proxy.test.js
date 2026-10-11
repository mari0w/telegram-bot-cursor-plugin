import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProxyUrl, resolveProxyUrl } from "../proxy.js";

test("Proxy order includes SAND first and each lowercase form", () => {
  const keys = ["SAND_EGRESS_TUNNEL_PROXY_ADDR", "HTTPS_PROXY", "https_proxy",
    "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];
  const env = Object.fromEntries(keys.map((key, i) => [key, `proxy${i}:8080`]));
  for (const [i, key] of keys.entries()) {
    assert.equal(resolveProxyUrl(env), `http://proxy${i}:8080`);
    env[key] = "  ";
  }
  assert.equal(resolveProxyUrl(env), undefined);
  assert.equal(resolveProxyUrl({}), undefined);
  assert.equal(normalizeProxyUrl("  proxy:8080  "), "http://proxy:8080");
  assert.equal(normalizeProxyUrl(" https://proxy:8080 "), "https://proxy:8080");
});
