import { chmod, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const sqlite = initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
const initializing = new Map();
const CHAT_MESSAGE_LIMIT = 2000;
const pick = (obj, fields) => Object.fromEntries(fields.filter((key) => obj[key] !== undefined)
  .map((key) => [key, obj[key]]));
const messageKey = (chat, id) => JSON.stringify([chat, id]);

function rows(db, sql) {
  const result = db.exec(sql)[0];
  return result ? result.values.map((values) => Object.fromEntries(result.columns.map((key, i) => [key, values[i]]))) : [];
}

function saveState(db, state) {
  const previous = new Map(rows(db, "SELECT chat_key, message_id, summarized_at FROM messages")
    .map((row) => [messageKey(row.chat_key, row.message_id), row.summarized_at]));
  const pending = new Map((state.pending ?? []).map(([chat, id], i) => [messageKey(String(chat), id), i]));
  const now = Math.floor(Date.now() / 1000);
  db.run("BEGIN");
  try {
    db.run("DELETE FROM meta; DELETE FROM chats; DELETE FROM messages;");
    for (const key of ["offset", "business", "last_update_at", "last_poll_at"]) {
      if (state[key] !== undefined) db.run("INSERT INTO meta VALUES (?, ?)", [key, JSON.stringify(state[key])]);
    }
    const insertChat = db.prepare("INSERT INTO chats VALUES (?, ?, ?, ?)");
    const insertMessage = db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?)");
    try {
      for (const [key, entry] of Object.entries(state.chats ?? {})) {
        insertChat.run([key, JSON.stringify(entry.chat), entry.left ? 1 : 0, entry.business_connection_id ?? null]);
        for (const message of entry.messages) {
          const id = messageKey(key, message.message_id);
          const order = message.outgoing ? undefined : pending.get(id);
          const summarized = order === undefined ? previous.get(id) ?? now : null;
          insertMessage.run([key, message.message_id, message.update_id ?? null, JSON.stringify(message), summarized, order ?? null]);
        }
      }
    } finally {
      insertChat.free();
      insertMessage.free();
    }
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

export function openStore(dataDir = path.join(os.homedir(), ".telegram-bot-cursor-plugin"), botId) {
  const dir = path.join(dataDir, String(botId));
  const file = path.join(dir, "store.sqlite");
  const legacy = path.join(dir, "store.json");
  const lock = path.join(dir, "poll.lock");
  const makeDir = async () => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
  };
  const persist = async (db) => {
    const temp = path.join(dir, "store.sqlite.tmp");
    await writeFile(temp, db.export(), { mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, file);
  };
  const load = async () => {
    const SQL = await sqlite;
    let bytes;
    try { bytes = await readFile(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const db = new SQL.Database(bytes);
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS chats (chat_key TEXT PRIMARY KEY, chat_json TEXT NOT NULL,
        left INTEGER, business_connection_id TEXT);
      CREATE TABLE IF NOT EXISTS messages (chat_key TEXT NOT NULL, message_id INTEGER NOT NULL,
        update_id INTEGER, payload TEXT NOT NULL, summarized_at INTEGER, pending_order INTEGER,
        PRIMARY KEY (chat_key, message_id));`);
    return { db, missing: !bytes?.length };
  };
  const initialize = async () => {
    await makeDir();
    const { db, missing } = await load();
    try {
      if (!rows(db, "SELECT key FROM meta LIMIT 1").length
        && !rows(db, "SELECT chat_key FROM chats LIMIT 1").length
        && !rows(db, "SELECT message_id FROM messages LIMIT 1").length) {
        try {
          const source = await readFile(legacy, "utf8");
          saveState(db, JSON.parse(source));
          await persist(db);
          await rename(legacy, `${legacy}.migrated`);
        } catch (error) {
          if (error.code !== "ENOENT") {
            console.error("Could not import the old message store. The plugin will use empty SQLite.");
            db.run("DELETE FROM meta; DELETE FROM chats; DELETE FROM messages;");
            await persist(db);
            // Archive a failed import too. Do not retry it on each read.
            await rename(legacy, `${legacy}.migrated`).catch(() => {});
          }
        }
      }
      if (missing) await persist(db);
    } finally { db.close(); }
  };
  const ready = async () => {
    if (!initializing.has(file)) initializing.set(file, initialize().finally(() => initializing.delete(file)));
    await initializing.get(file);
  };
  return {
    dir,
    async read() {
      await ready();
      const { db } = await load();
      try {
        const state = { offset: 0, chats: {}, pending: [] };
        for (const { key, value } of rows(db, "SELECT key, value FROM meta")) state[key] = JSON.parse(value);
        for (const row of rows(db, "SELECT * FROM chats ORDER BY rowid")) {
          state.chats[row.chat_key] = { chat: JSON.parse(row.chat_json), messages: [],
            ...(row.left ? { left: true } : {}),
            ...(row.business_connection_id ? { business_connection_id: row.business_connection_id } : {}) };
        }
        for (const row of rows(db, "SELECT chat_key, payload FROM messages ORDER BY rowid")) {
          state.chats[row.chat_key].messages.push(JSON.parse(row.payload));
        }
        state.pending = rows(db, "SELECT chat_key, message_id FROM messages WHERE summarized_at IS NULL ORDER BY pending_order")
          .map((row) => [row.chat_key, row.message_id]);
        return state;
      } finally { db.close(); }
    },
    async write(state) {
      await ready();
      const { db } = await load();
      try {
        saveState(db, state);
        await persist(db);
      } finally { db.close(); }
    },
    async withLock(fn) {
      await makeDir();
      let handle;
      try {
        handle = await open(lock, "wx", 0o600);
      } catch (error) {
        if (error.code === "EEXIST") {
          const busy = new Error(`Another process is reading messages for this bot. Try again later. If no other process runs, delete ${lock}.`);
          busy.code = "STORE_BUSY";
          throw busy;
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
  if (!id) delete entry.left;
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
  const index = entry.messages.findIndex((item) => item.message_id === message.message_id);
  if (index === -1) entry.messages.push(message);
  else entry.messages[index] = message;
  store.pending ??= [];
  const pendingIds = new Set(store.pending.filter(([chat]) => chat === key).map(([, id]) => id));
  const dropped = entry.messages.slice(0, -CHAT_MESSAGE_LIMIT).filter((item) => pendingIds.has(item.message_id));
  entry.messages = [...dropped, ...entry.messages.slice(-CHAT_MESSAGE_LIMIT)];
  if (!outgoing && !message.outgoing
    && !store.pending.some(([chat, message_id]) => chat === key && message_id === message.message_id)) {
    store.pending.push([key, message.message_id]);
  }
  return message;
}

export function addUpdates(store, updates) {
  let messages = [];
  for (const update of updates) {
    if (update.my_chat_member) {
      const { chat, new_chat_member } = update.my_chat_member;
      let status = new_chat_member.status;
      if (["member", "administrator", "left", "kicked"].includes(status)) {
        const entry = store.chats[chat.id] ??= { chat: {}, messages: [] };
        entry.chat = pick(chat, ["id", "type", "title", "username", "first_name", "last_name"]);
        if (status === "left" || status === "kicked") entry.left = true;
        else delete entry.left;
      }
    }
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
