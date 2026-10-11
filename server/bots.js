export function loadBots(env) {
  const bots = [];
  for (let number = 1; number <= 5; number++) {
    const suffix = number === 1 ? "" : `_${number}`;
    const token = env[`TELEGRAM_BOT_TOKEN${suffix}`]?.trim();
    if (!token || /^\$\{[^}]*\}$/.test(token)) continue;
    bots.push({ number, token, id: token.match(/^(\d+):/)?.[1] ?? "", default: number === 1 });
  }
  return bots;
}

const setupDone = "设置已完成。可以把机器人加进需要的群，然后让我读新消息，或每天给你总结和待办。";
const setupSteps = [
  "请在 @BotFather 打开这个机器人的设置，打开 Secretary Mode。",
  "请在 @BotFather 发送 /setprivacy，选择这个机器人，点击 Disable，然后把机器人移出原来已加入的群，再加回群。",
  "请在 Telegram 设置 > Telegram Business > Chatbots 添加这个机器人，选择聊天并允许回复，然后告诉我，让我读一次新消息。",
  "请在 Telegram 设置 > Telegram Business > Chatbots 打开这个机器人的连接设置，允许回复消息。",
];

export function businessStatus(me, store) {
  const enabled = Object.values(store.business ?? {}).filter((connection) => connection.is_enabled === true);
  const can_reply = enabled.some((connection) => connection.can_reply === true);
  const missing_steps = [];
  if (me.can_connect_to_business !== true) missing_steps.push(setupSteps[0]);
  if (me.can_read_all_group_messages !== true) missing_steps.push(setupSteps[1]);
  if (!enabled.length) missing_steps.push(setupSteps[2]);
  else if (!can_reply) missing_steps.push(setupSteps[3]);
  return { can_connect_to_business: me.can_connect_to_business === true,
    can_read_all_group_messages: me.can_read_all_group_messages === true,
    business_connected: enabled.length > 0, can_reply, missing_steps, next_step: missing_steps[0] ?? setupDone };
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
  let lastError;
  for (const entry of bots) {
    let username;
    try {
      username = await getUsername(entry);
    } catch (error) {
      lastError = new Error(`bot ${entry.number}: ${error.message}`);
      continue;
    }
    if (username && username.toLowerCase() === name) return entry;
  }
  if (lastError) throw lastError;
  throw new Error(`Unknown bot. Configured bot IDs: ${bots.map((entry) => entry.id).join(", ") || "none"}.`);
}
