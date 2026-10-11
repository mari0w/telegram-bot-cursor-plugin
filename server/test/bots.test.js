import test from "node:test";
import assert from "node:assert/strict";
import { loadBots, selectBot } from "../bots.js";
const env = { TELEGRAM_BOT_TOKEN: "101:fake-one", TELEGRAM_BOT_TOKEN_2: "202:fake-two" };

test("Load default bot, gaps, unset values, and five-bot limit", () => {
  assert.deepEqual(loadBots({ TELEGRAM_BOT_TOKEN: " 101:fake-one " }), [
    { number: 1, token: env.TELEGRAM_BOT_TOKEN, id: "101", default: true },
  ]);
  assert.deepEqual(loadBots({ TELEGRAM_BOT_TOKEN_2: env.TELEGRAM_BOT_TOKEN_2,
    TELEGRAM_BOT_TOKEN_5: "505:fake-five", TELEGRAM_BOT_TOKEN_6: "606:ignored" })
    .map(({ number, default: isDefault }) => [number, isDefault]), [[2, false], [5, false]]);
  for (const value of ["", "  ", " ${TELEGRAM_BOT_TOKEN_2} "]) {
    assert.deepEqual(loadBots({ TELEGRAM_BOT_TOKEN: value, TELEGRAM_BOT_TOKEN_2: value }), []);
  }
});

test("Select default, numeric ID without lookup, and username with case and @", async () => {
  const bots = loadBots(env);
  const noLookup = () => assert.fail("Numeric IDs must not use the network");
  assert.equal(await selectBot(bots, undefined, noLookup), bots[0]);
  assert.equal(await selectBot(bots, "202", noLookup), bots[1]);
  for (const name of ["Second_Bot", "@SECOND_bot"]) {
    assert.equal(await selectBot(bots, name, async (entry) => entry.number === 2 ? "second_bot" : "first_bot"), bots[1]);
  }
});

test("Unknown bot has no fallback or token; missing default names its setting", async () => {
  await assert.rejects(selectBot(loadBots(env), env.TELEGRAM_BOT_TOKEN, async () => "first_bot"), (error) => {
    assert.equal(error.message, "Unknown bot. Configured bot IDs: 101, 202.");
    assert.ok(!error.message.includes(env.TELEGRAM_BOT_TOKEN));
    return true;
  });
  await assert.rejects(selectBot(loadBots({ TELEGRAM_BOT_TOKEN_2: env.TELEGRAM_BOT_TOKEN_2 })), {
    message: "Missing TELEGRAM_BOT_TOKEN. Set it in the plugin Configure / MCP env.",
  });
});
