export function loadBots(env) {
  const bots = [];
  for (let number = 1; number <= 5; number++) {
    const suffix = number === 1 ? "" : `_${number}`;
    const token = env[`TELEGRAM_BOT_TOKEN${suffix}`]?.trim();
    if (!token || /^\$\{[^}]*\}$/.test(token)) continue;
    bots.push({ number, token, id: token.split(":")[0], default: number === 1 });
  }
  return bots;
}

export async function selectBot(bots, bot, getUsername) {
  if (bot === undefined) {
    const selected = bots.find((entry) => entry.default);
    if (!selected) {
      throw new Error("Missing TELEGRAM_BOT_TOKEN. Set it in the plugin Configure / MCP env.");
    }
    return selected;
  }
  const name = bot.trim().replace(/^@/, "").toLowerCase();
  const byId = bots.find((entry) => entry.id === name);
  if (byId) return byId;
  for (const entry of bots) {
    const username = await getUsername(entry);
    if (username && username.toLowerCase() === name) return entry;
  }
  throw new Error(`Unknown bot. Configured bot IDs: ${bots.map((entry) => entry.id).join(", ") || "none"}.`);
}
