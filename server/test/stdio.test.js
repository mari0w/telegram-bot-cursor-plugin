import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Stdio exposes exactly get_me and list_bots with no tokens", { timeout: 10000 }, async (t) => {
  const env = { ...process.env };
  for (let n = 1; n <= 5; n++) env[`TELEGRAM_BOT_TOKEN${n === 1 ? "" : `_${n}`}`] = "";
  const child = spawn(process.execPath, [fileURLToPath(new URL("../index.js", import.meta.url))], {
    env, stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  const lines = createInterface({ input: child.stdout });
  const responses = lines[Symbol.asyncIterator]();
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  t.after(async () => { lines.close(); child.kill(); await exited; });
  const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  const receive = async () => {
    const { value, done } = await responses.next();
    assert.equal(done, false, stderr);
    return JSON.parse(value);
  };
  send({ id: 1, method: "initialize", params: { protocolVersion: "2024-11-05",
    capabilities: {}, clientInfo: { name: "stdio-test", version: "0.1.0" } } });
  assert.equal((await receive()).result.serverInfo.name, "telegram-bot");
  send({ method: "notifications/initialized" });
  send({ id: 2, method: "tools/list", params: {} });
  assert.deepEqual((await receive()).result.tools.map((tool) => tool.name).sort(), ["get_me", "list_bots"]);
  assert.equal(stderr, "");
});
