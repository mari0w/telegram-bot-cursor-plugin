import { addBusinessConnection, addUpdates, openStore } from "./store.js";
import { callApi, errorMessage, redact } from "./telegram.js";

const UPDATE_CALL_LIMIT = 20;
const allowed_updates = ["message", "edited_message", "channel_post", "edited_channel_post",
  "my_chat_member", "business_connection", "business_message", "edited_business_message", "deleted_business_messages"];

export function pollSettings(env) {
  const enabled = !["0", "false", "no", "off"].includes(env.TELEGRAM_POLL_ENABLED?.trim().toLowerCase());
  const interval = env.TELEGRAM_POLL_INTERVAL_SEC?.trim();
  const seconds = Number(interval);
  const intervalSec = interval && Number.isFinite(seconds) ? Math.max(30, Math.min(600, seconds)) : 120;
  return { enabled, intervalSec };
}

export async function pollBot(entry, { dataDir, fetch, env, tokens }) {
  const store = openStore(dataDir, entry.id);
  return store.withLock(async () => {
    const state = await store.read();
    const resetOffset = state.last_update_at === undefined ? state.offset > 0
      : Math.floor(Date.now() / 1000) - state.last_update_at >= 6 * 24 * 60 * 60;
    const checkedConnections = new Set();
    let more = false;
    for (let batch = 0; batch < UPDATE_CALL_LIMIT; batch++) {
      const updates = await callApi(entry.token, "getUpdates", {
        ...(batch === 0 && resetOffset ? {} : { offset: state.offset }),
        timeout: 0, limit: 100, allowed_updates,
      }, { fetch, env, timeoutMs: 10000 });
      const connectionIds = new Set(updates.map((update) => (update.business_message
        ?? update.edited_business_message ?? update.deleted_business_messages)?.business_connection_id).filter(Boolean));
      for (const business_connection_id of connectionIds) {
        if (state.business?.[business_connection_id]?.user_id !== undefined || checkedConnections.has(business_connection_id)) continue;
        checkedConnections.add(business_connection_id);
        const connection = updates.find((update) => update.business_connection?.id === business_connection_id)?.business_connection
          ?? await callApi(entry.token, "getBusinessConnection", { business_connection_id }, { fetch, env });
        addBusinessConnection(state, JSON.parse(redact(JSON.stringify(connection), tokens)));
      }
      addUpdates(state, JSON.parse(redact(JSON.stringify(updates), tokens)));
      state.last_poll_at = Math.floor(Date.now() / 1000);
      await store.write(state);
      more = updates.length === 100;
      if (!more) break;
    }
    return { bot_id: entry.id, more };
  });
}

export function startPoller(server, bots, { pollEnabled, env, ...options }) {
  const settings = pollSettings(env);
  const active = new Map();
  let closed = false;
  let timer;
  const poll = (entry) => {
    if (closed || active.has(entry.id)) return Promise.resolve({ bot_id: entry.id, skipped: true });
    const task = pollBot(entry, { ...options, env }).catch((error) => {
      if (error.code === "STORE_BUSY") return { bot_id: entry.id, skipped: true };
      const guidance = error.code === 409
        ? " Telegram returned 409 Conflict. Call get_webhook_info to check. A webhook or another poller can cause this. Use delete_webhook with confirm=true only after the user agrees." : "";
      const message = errorMessage(error, options.tokens) + guidance;
      console.error(`Background fetch failed for bot ${entry.id}: ${message}`);
      return { bot_id: entry.id, error: message };
    }).finally(() => active.delete(entry.id));
    active.set(entry.id, task);
    return task;
  };
  // Tests can run one fetch with timers disabled. Tools never call this helper.
  server.pollOnce = async (botId) => {
    const selected = botId === undefined ? bots : bots.filter((entry) => entry.id === String(botId));
    return Promise.all(selected.map(poll));
  };
  const close = server.close.bind(server);
  server.close = async () => {
    closed = true;
    clearInterval(timer);
    await Promise.all(active.values());
    await close();
  };
  if ((pollEnabled ?? settings.enabled) && bots.length) {
    timer = setInterval(() => { void server.pollOnce(); }, settings.intervalSec * 1000);
    timer.unref();
    void server.pollOnce();
  }
}
