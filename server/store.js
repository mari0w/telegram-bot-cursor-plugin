import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CHAT_MESSAGE_LIMIT = 2000;
const pick = (obj, fields) => Object.fromEntries(fields.filter((key) => obj[key] !== undefined)
  .map((key) => [key, obj[key]]));

export function openStore(dataDir = path.join(os.homedir(), ".telegram-bot-cursor-plugin"), botId) {
  const dir = path.join(dataDir, String(botId));
  const file = path.join(dir, "store.json");
  const lock = path.join(dir, "poll.lock");
  const makeDir = () => mkdir(dir, { recursive: true, mode: 0o700 });
  return {
    dir,
    async read() {
      try {
        const state = JSON.parse(await readFile(file, "utf8"));
        state.pending ??= [];
        return state;
      } catch (error) {
        if (error.code === "ENOENT") return { offset: 0, chats: {}, pending: [] };
        throw error;
      }
    },
    async write(store) {
      await makeDir();
      const temp = path.join(dir, "store.json.tmp");
      await writeFile(temp, JSON.stringify(store), { mode: 0o600 });
      await rename(temp, file);
    },
    async withLock(fn) {
      await makeDir();
      let handle;
      try {
        handle = await open(lock, "wx", 0o600);
      } catch (error) {
        if (error.code === "EEXIST") {
          throw new Error(`Another process is reading messages for this bot. Try again later. If no other process runs, delete ${lock}.`);
        }
        throw error;
      }
      try {
        return await fn();
      } finally {
        await handle.close();
        await unlink(lock);
      }
    },
  };
}

export const chatKey = (id, business_connection_id) => business_connection_id
  ? `${business_connection_id}:${id}` : String(id);

export function addBusinessConnection(store, connection) {
  store.business ??= {};
  store.business[connection.id] = { user_id: connection.user.id,
    user_name: connection.user.username || connection.user.first_name,
    ...pick({ user_username: connection.user.username }, ["user_username"]),
    user_chat_id: connection.user_chat_id, can_reply: connection.rights?.can_reply === true,
    is_enabled: connection.is_enabled, date: connection.date };
}

export function addMessage(store, source, { update_id, edited = false, outgoing = false } = {}) {
  const id = source.business_connection_id;
  const key = chatKey(source.chat.id, id);
  const entry = store.chats[key] ??= { chat: {}, messages: [] };
  if (update_id !== undefined && entry.messages.some((message) => message.update_id === update_id)) return;
  entry.chat = pick(source.chat, ["id", "type", "title", "username", "first_name", "last_name"]);
  const message = { ...pick({ update_id }, ["update_id"]), ...pick(source, ["message_id", "date", "edit_date"]),
    chat_id: source.chat.id };
  if (id) {
    store.business ??= {};
    const connection = store.business[id] ??= {};
    entry.business_connection_id = message.business_connection_id = id;
    if (outgoing || (source.from && source.from.id === connection.user_id) || source.sender_business_bot) message.outgoing = true;
  }
  if (source.from) message.from = pick(source.from, ["id", "is_bot", "username", "first_name", "last_name"]);
  if (source.text !== undefined || source.caption !== undefined) message.text = source.text ?? source.caption;
  const kind = ["photo", "animation", "document", "video", "audio", "voice", "sticker", "video_note"]
    .find((key) => source[key]);
  if (kind) {
    const file = kind === "photo" ? source.photo.reduce((a, b) =>
      a.width * a.height > b.width * b.height ? a : b) : source[kind];
    message.file = { kind, ...pick(file, ["file_id", "file_name", "file_size", "mime_type"]) };
  }
  if (source.reply_to_message) message.reply_to_message_id = source.reply_to_message.message_id;
  if (source.reply_to_message?.from) message.reply_to_from_id = source.reply_to_message.from.id;
  if (["new_chat_members", "left_chat_member", "new_chat_title", "new_chat_photo", "delete_chat_photo",
    "group_chat_created", "supergroup_chat_created", "channel_chat_created", "message_auto_delete_timer_changed",
    "migrate_to_chat_id", "migrate_from_chat_id", "pinned_message"].some((key) => source[key] !== undefined)) message.service = true;
  if (edited) message.edited = true;
  const index = edited ? entry.messages.findIndex((item) => item.message_id === message.message_id) : -1;
  if (index === -1) entry.messages.push(message);
  else entry.messages[index] = message;
  entry.messages = entry.messages.slice(-CHAT_MESSAGE_LIMIT);
  store.pending ??= [];
  if (!outgoing && !message.outgoing
    && !store.pending.some(([chat, message_id]) => chat === key && message_id === message.message_id)) {
    store.pending.push([key, message.message_id]);
  }
  return message;
}

export function addUpdates(store, updates) {
  let messages = [];
  for (const update of updates) {
    if (update.business_connection) addBusinessConnection(store, update.business_connection);
    if (update.deleted_business_messages) {
      const { business_connection_id, chat, message_ids } = update.deleted_business_messages;
      const key = chatKey(chat.id, business_connection_id);
      const entry = store.chats[key];
      if (entry) entry.messages = entry.messages.filter((message) => !message_ids.includes(message.message_id));
      messages = messages.filter((message) => chatKey(message.chat_id, message.business_connection_id) !== key
        || !message_ids.includes(message.message_id));
    }
    const type = ["message", "edited_message", "channel_post", "edited_channel_post",
      "business_message", "edited_business_message"]
      .find((key) => update[key]);
    if (!type) continue;
    const message = addMessage(store, update[type], { update_id: update.update_id, edited: type.startsWith("edited_") });
    if (message) messages.push(message);
  }
  if (updates.length) {
    store.offset = Math.max(...updates.map((update) => update.update_id)) + 1;
    store.last_update_at = Math.floor(Date.now() / 1000);
  }
  return messages;
}
