import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const pick = (obj, fields) => Object.fromEntries(fields.filter((key) => obj[key] !== undefined)
  .map((key) => [key, obj[key]]));

export function openStore(dataDir = path.join(os.homedir(), ".telegram-bot-cursor-plugin"), botId) {
  const dir = path.join(dataDir, String(botId));
  const file = path.join(dir, "store.json");
  const lock = path.join(dir, "poll.lock");
  const makeDir = () => mkdir(dir, { recursive: true, mode: 0o700 });
  return {
    async read() {
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return { offset: 0, chats: {} };
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

export function addUpdates(store, updates) {
  const messages = [];
  for (const update of updates) {
    const type = ["message", "edited_message", "channel_post", "edited_channel_post"]
      .find((key) => update[key]);
    if (!type) continue;
    const source = update[type];
    const entry = store.chats[source.chat.id] ??= { chat: {}, messages: [] };
    if (entry.messages.some((message) => message.update_id === update.update_id)) continue;
    entry.chat = pick(source.chat, ["id", "type", "title", "username", "first_name", "last_name"]);
    const message = { update_id: update.update_id, ...pick(source, ["message_id", "date", "edit_date"]),
      chat_id: source.chat.id };
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
    const edited = type.startsWith("edited_");
    if (edited) message.edited = true;
    const index = edited ? entry.messages.findIndex((item) => item.message_id === message.message_id) : -1;
    if (index === -1) entry.messages.push(message);
    else entry.messages[index] = message;
    entry.messages = entry.messages.slice(-200);
    messages.push(message);
  }
  if (updates.length) store.offset = Math.max(...updates.map((update) => update.update_id)) + 1;
  return messages;
}
