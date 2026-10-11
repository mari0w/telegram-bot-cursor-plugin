#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { businessStatus, loadBots, selectBot } from "./bots.js";
import { callApi, downloadFile, errorMessage, redact } from "./telegram.js";
import { addBusinessConnection, addMessage, addUpdates, chatKey, openStore } from "./store.js";
import { classify, describeFilterChanges, filterFields, formatMessage, formatMessages,
  ownerNamesHint, previewFilterImpact, readFilters, writeFilters } from "./filter.js";

const botSchema = z.string().optional().describe("Bot username (with or without @) or numeric bot ID from list_bots. Omit for the default bot (TELEGRAM_BOT_TOKEN).");
const UPDATE_CALL_LIMIT = 20;
const RATE_REMINDER = "Reminder: Telegram limits: in one chat, avoid more than 1 message per second; in one group, no more than 20 messages per minute; for bulk notifications, about 30 messages per second at most. Over the limit, Telegram returns 429 with retry_after. Bots that share one token share these limits.";

function textResult(obj, tokens = []) {
  return plainTextResult(JSON.stringify(obj, null, 2), tokens);
}

function plainTextResult(text, tokens = []) {
  return { content: [{ type: "text", text: redact(text, tokens) }] };
}

function errorResult(error, tokens) {
  return { content: [{ type: "text", text: `Error: ${errorMessage(error, tokens)}` }], isError: true };
}

export function createServer({ env = process.env, fetch, dataDir } = {}) {
  const server = new McpServer({ name: "telegram-bot", version: "1.1.0" });
  const bots = loadBots(env);
  const tokens = bots.map((entry) => entry.token);
  const usernames = new Map();
  const getMe = async (entry) => {
    const result = await callApi(entry.token, "getMe", {}, { fetch, env });
    usernames.set(entry.number, result.username);
    return result;
  };
  const getUsername = async (entry) => usernames.has(entry.number)
    ? usernames.get(entry.number) : (await getMe(entry)).username;
  const filterMe = async (entry, state) => {
    const owners = Object.values(state.business ?? {});
    return { id: entry.id, username: await getUsername(entry),
      owner_ids: owners.map((owner) => owner.user_id).filter((id) => id !== undefined),
      owner_usernames: owners.map((owner) => owner.user_username).filter(Boolean) };
  };

  const send = async (method, { bot, confirm, ...params }, notice) => {
    try {
      let source;
      let localFile;
      const fileField = method === "sendPhoto" ? "photo" : method === "sendDocument" ? "document" : undefined;
      if (fileField) {
        const { file, ...rest } = params;
        localFile = existsSync(file) ? await stat(file) : undefined;
        const maxMB = fileField === "photo" ? 10 : 50;
        if (localFile && localFile.size > maxMB * 1024 * 1024) {
          throw new Error(`Local ${fileField} exceeds the ${maxMB} MB upload limit (${localFile.size} bytes).`);
        }
        source = localFile ? { kind: "local", file_size: localFile.size }
          : { kind: /^https?:\/\//i.test(file) ? "url" : "file_id" };
        params = { ...rest, [fileField]: file };
      }
      const entry = await selectBot(bots, bot, getUsername);
      const savesMessage = ["sendMessage", "editMessageText", "forwardMessage", "sendPhoto", "sendDocument"].includes(method);
      const deletesMessage = method === "deleteMessage";
      const store = openStore(dataDir, entry.id);
      const state = await store.read();
      const { chat_id: key, message_id } = params;
      const businessChat = typeof key === "string" && key.match(/^(.+):(-?\d+)$/);
      if (businessChat && method === "forwardMessage") {
        params = { ...params, chat_id: Number(businessChat[2]) };
      } else if (businessChat && (deletesMessage || state.business?.[businessChat[1]])) {
        if (deletesMessage) {
          method = "deleteBusinessMessages";
          params = { business_connection_id: businessChat[1], message_ids: [message_id] };
        } else {
          params = { ...params, business_connection_id: businessChat[1], chat_id: Number(businessChat[2]) };
          notice = "这条会以你本人的身份发送。";
        }
      }
      if (!confirm) {
        return textResult({ sent: false, preview: { bot_id: entry.id,
          chat: state.chats[key]?.chat ?? null, method, params, ...(source ? { source } : {}) },
          notice: `${notice} Show this preview to the user. Call again with confirm=true after the user agrees.`,
          rate_reminder: RATE_REMINDER }, tokens);
      }
      let body = params;
      if (localFile) {
        body = new FormData();
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined) continue;
          if (key === fileField) body.append(key, new Blob([await readFile(value)]), path.basename(value));
          else body.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
        }
      }
      const result = await callApi(entry.token, method, body,
        { fetch, env, ...(body instanceof FormData ? { timeoutMs: 120000 } : {}) });
      const response = { ...(result === true ? (deletesMessage ? { deleted: true } : { ok: true }) : result),
        rate_reminder: RATE_REMINDER };
      if (deletesMessage || (savesMessage && result !== true)) try {
        await store.withLock(async () => {
          const state = await store.read();
          if (deletesMessage) {
            const chat = state.chats[key];
            if (chat) chat.messages = chat.messages.filter((message) => message.message_id !== message_id);
          } else {
            addMessage(state, JSON.parse(redact(JSON.stringify(result), tokens)),
              { edited: method === "editMessageText", outgoing: true });
          }
          await store.write(state);
        });
      } catch (error) {
        response.store_error = errorMessage(error, tokens);
      }
      return textResult(response, tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  };

  server.tool("send_message", "Send text as the bot. For a business chat key, send as the owner. Show a preview first. Set confirm=true only after the user agrees. Remind the user of rate limits before bursts or bulk sends. Text must be 1-4096 characters after entity parsing. On 429, stop and wait retry_after seconds.", {
    bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
    text: z.string().min(1), parse_mode: z.enum(["HTML", "MarkdownV2"]).optional(),
    reply_to_message_id: z.number().int().optional(), disable_notification: z.boolean().optional(),
  }, async ({ reply_to_message_id, ...args }) => send("sendMessage", {
    ...args, ...(reply_to_message_id === undefined ? {} : { reply_parameters: { message_id: reply_to_message_id } }),
  }, "The bot sends this as itself. Others in the chat can see it."));

  server.tool("edit_message", "Edit message text. For a business chat key, edit as the owner. Show a preview first. Set confirm=true only after the user agrees. Remind the user of rate limits before bursts or bulk sends. Text must be 1-4096 characters after entity parsing. On 429, stop and wait retry_after seconds.", {
    bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
    message_id: z.number().int(), text: z.string().min(1), parse_mode: z.enum(["HTML", "MarkdownV2"]).optional(),
  }, async (args) => send("editMessageText", args, "The bot edits this message. Others in the chat can see the change."));

  server.tool("delete_message", "Delete a message. Telegram can delete only messages sent less than 48 hours ago. Show a preview first. Set confirm=true only after the user agrees.", {
    bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
    message_id: z.number().int(),
  }, async (args) => send("deleteMessage", args, "The bot deletes this message. The message is removed from the chat."));

  server.tool("forward_message", "Forward a message to a chat as the bot. Show a preview first. Set confirm=true only after the user agrees. Remind the user of rate limits before bursts or bulk sends. On 429, stop and wait retry_after seconds.", {
    bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
    from_chat_id: z.union([z.string(), z.number()]), message_id: z.number().int(),
    disable_notification: z.boolean().optional(),
  }, async (args) => send("forwardMessage", args, "The bot forwards this as itself. Others in the target chat can see it."));

  for (const [name, method, kind, uploadMB, urlMB] of [
    ["send_photo", "sendPhoto", "photo", 10, 5],
    ["send_document", "sendDocument", "document", 50, 20],
  ]) {
    server.tool(name, `Send a ${kind} as the bot from a local file, HTTP(S) URL, or Telegram file_id. For a business chat key, send as the owner. Show a preview first. Set confirm=true only after the user agrees. Remind the user of rate limits before bursts or bulk sends. Caption must be 0-1024 characters after entity parsing. Local upload limit: ${uploadMB} MB. Telegram URL limit: ${urlMB} MB; the plugin does not check URL sizes. On 429, stop and wait retry_after seconds.`, {
      bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
      file: z.string(), caption: z.string().optional(), parse_mode: z.enum(["HTML", "MarkdownV2"]).optional(),
      reply_to_message_id: z.number().int().optional(), disable_notification: z.boolean().optional(),
    }, async ({ reply_to_message_id, ...args }) => send(method, {
      ...args, ...(reply_to_message_id === undefined ? {} : { reply_parameters: { message_id: reply_to_message_id } }),
    }, `The bot sends this ${kind} as itself. Others in the chat can see it.`));
  }

  server.tool("download_file", "Download a Telegram file to the bot's local files directory. Return a local path only. Telegram allows bot downloads up to 20 MB. See https://core.telegram.org/bots/api#getfile.", {
    bot: botSchema, file_id: z.string(),
  }, async ({ bot, file_id }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const file = await callApi(entry.token, "getFile", { file_id }, { fetch, env });
      const bytes = await downloadFile(entry.token, file.file_path, { fetch, env, timeoutMs: 120000 });
      const dir = path.join(openStore(dataDir, entry.id).dir, "files");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const localPath = path.join(dir, `${file.file_unique_id}_${path.basename(file.file_path)}`);
      await writeFile(localPath, bytes, { mode: 0o600 });
      return textResult({ path: localPath, file_size: file.file_size ?? bytes.length, file_path: file.file_path }, tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  for (const [name, method, description, schema] of [
    ["get_chat", "getChat", "Get current chat details.", { chat_id: z.union([z.string(), z.number()]) }],
    ["get_chat_admins", "getChatAdministrators", "Get the chat's administrators.", { chat_id: z.union([z.string(), z.number()]) }],
    ["get_commands", "getMyCommands", "Get the bot's command menu.", {}],
  ]) {
    server.tool(name, description, { bot: botSchema, ...schema }, async ({ bot, ...params }) => {
      try {
        const entry = await selectBot(bots, bot, getUsername);
        return textResult(await callApi(entry.token, method, params, { fetch, env }), tokens);
      } catch (error) {
        return errorResult(error, tokens);
      }
    });
  }

  server.tool("pin_message", "Pin a chat message. Show a preview first. Set confirm=true only after the user agrees.", {
    bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
    message_id: z.number().int(), disable_notification: z.boolean().optional(),
  }, async (args) => send("pinChatMessage", args, "The bot pins this message in the chat."));

  server.tool("unpin_message", "Unpin a chat message. Omit message_id to unpin the most recent pinned message. Show a preview first. Set confirm=true only after the user agrees.", {
    bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
    message_id: z.number().int().optional(),
  }, async (args) => send("unpinChatMessage", args, "The bot removes this pin from the chat."));

  server.tool("set_commands", "Set the bot's command menu. Use at most 100 commands. Each command must have 1-32 characters and a nonempty description. Show a preview first. Set confirm=true only after the user agrees.", {
    bot: botSchema, confirm: z.boolean().default(false),
    commands: z.array(z.object({ command: z.string().min(1).max(32), description: z.string().min(1) })).max(100),
  }, async (args) => send("setMyCommands", args, "The bot changes its command menu."));

  server.tool("list_bots", "List configured bots. Return bot IDs and names without tokens.", {}, async () => {
    try {
      const results = [];
      for (const entry of bots) {
        const info = { number: entry.number, id: entry.id, default: entry.default };
        try {
          const me = await getMe(entry);
          const { can_connect_to_business, can_read_all_group_messages, missing_steps, next_step } =
            businessStatus(me, await openStore(dataDir, entry.id).read());
          results.push({ ...info, username: me.username, first_name: me.first_name, ok: true,
            can_connect_to_business, can_read_all_group_messages, missing_steps, next_step });
        } catch (error) {
          results.push({ ...info, ok: false, error: errorMessage(error, tokens) });
        }
      }
      return textResult(results, tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("get_me", "Get the selected bot's details and missing setup steps. Refresh known business connections.", {
    bot: botSchema,
  }, async ({ bot }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const me = await getMe(entry);
      const store = openStore(dataDir, entry.id);
      const status = await store.withLock(async () => {
        const state = await store.read();
        const ids = Object.keys(state.business ?? {});
        for (const business_connection_id of ids) {
          const connection = await callApi(entry.token, "getBusinessConnection", { business_connection_id }, { fetch, env });
          addBusinessConnection(state, JSON.parse(redact(JSON.stringify(connection), tokens)));
        }
        if (ids.length) await store.write(state);
        return businessStatus(me, state);
      });
      const { id, username, first_name, can_join_groups, supports_inline_queries } = me;
      return textResult({ id, username, first_name, can_join_groups, supports_inline_queries,
        ...status, number: entry.number, default: entry.default }, tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });
  server.tool("read_new_messages", "Fetch and save new updates in batches of 100, up to 20 calls. Show the next page of saved incoming messages. Set limit from 1 to 1000 (default 200). Only the first fetch uses timeout. Call again while updates or saved messages are waiting. Omit mode to use the saved default_mode (initially all). Mode all shows every readable incoming message in full. Mode for_me shows private chats, bot and owner @mentions and replies, allowed chats, allowed users, and include matches in full. Other group messages show one summary line per group. Both modes apply local filters and the 500-character cut. Muted chats show counts only. Protected words stop exclusions. Messages for the owner are kept unless an exclude_rules item has include_for_me=true. Hidden messages show a count. Use get_chat_messages with show_filtered=true to view them. Owner messages in business chats are saved as context only. Never mark messages as read. Telegram keeps updates for 24 hours only.", {
    bot: botSchema, timeout: z.number().int().min(0).max(50).default(0),
    limit: z.number().int().min(1).max(1000).default(200),
    mode: z.enum(["all", "for_me"]).optional(),
  }, async ({ bot, timeout, limit, mode }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const store = openStore(dataDir, entry.id);
      return await store.withLock(async () => {
        const state = await store.read();
        await getUsername(entry);
        const resetOffset = state.last_update_at === undefined ? state.offset > 0
          : Math.floor(Date.now() / 1000) - state.last_update_at >= 6 * 24 * 60 * 60;
        let more = false;
        const checkedConnections = new Set();
        for (let batch = 0; batch < UPDATE_CALL_LIMIT; batch++) {
          const wait = batch === 0 ? timeout : 0;
          const updates = await callApi(entry.token, "getUpdates", {
            ...(batch === 0 && resetOffset ? {} : { offset: state.offset }), timeout: wait, limit: 100,
            allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post",
              "my_chat_member", "business_connection", "business_message", "edited_business_message", "deleted_business_messages"],
          }, { fetch, env, timeoutMs: (wait + 10) * 1000 });
          const connectionIds = new Set(updates.map((update) => (update.business_message
            ?? update.edited_business_message ?? update.deleted_business_messages)?.business_connection_id).filter(Boolean));
          for (const business_connection_id of connectionIds) {
            if (state.business?.[business_connection_id]?.user_id !== undefined || checkedConnections.has(business_connection_id)) continue;
            checkedConnections.add(business_connection_id);
            try {
              const connection = updates.find((update) => update.business_connection?.id === business_connection_id)?.business_connection
                ?? await callApi(entry.token, "getBusinessConnection", { business_connection_id }, { fetch, env });
              addBusinessConnection(state, JSON.parse(redact(JSON.stringify(connection), tokens)));
            } catch { /* Keep polling if the connection lookup fails. */ }
          }
          addUpdates(state, JSON.parse(redact(JSON.stringify(updates), tokens)));
          await store.write(state);
          more = updates.length === 100;
          if (!more) break;
        }
        state.pending = state.pending.filter(([key, id]) =>
          state.chats[key]?.messages.some((message) => message.message_id === id));
        const me = await filterMe(entry, state);
        const rules = await readFilters(store.dir);
        const priority = (message) => {
          const chat = state.chats[chatKey(message.chat_id, message.business_connection_id)].chat;
          return chat.type === "private" || classify(message, chat, rules, me, "for_me") === "full";
        };
        const messages = state.pending.map(([key, id]) =>
          state.chats[key].messages.find((message) => message.message_id === id))
          .sort((a, b) => Number(priority(b)) - Number(priority(a))).slice(0, limit);
        const shown = new Set(messages.map((message) => `${chatKey(message.chat_id, message.business_connection_id)}:${message.message_id}`));
        state.pending = state.pending.filter(([key, id]) => !shown.has(`${key}:${id}`));
        const result = plainTextResult(formatMessages({ bot_id: entry.id, messages, chats: state.chats, rules, me,
          offset: state.offset, more, mode, pending: state.pending }), tokens);
        await store.write(state);
        return result;
      });
    } catch (error) {
      if (error.code === 409) {
        error = new Error(`Telegram returned 409 Conflict. A webhook is set for this bot, or another process polls this bot. Call get_webhook_info to check. Call delete_webhook with confirm=true to remove the webhook. ${errorMessage(error, tokens)}`);
      }
      return errorResult(error, tokens);
    }
  });

  server.tool("get_chat_messages", "Read saved messages for one chat as compact text, oldest first. Set message_id to show its saved original reply message first, then context messages before and after it. Context defaults to 5 on each side (0-50). The target starts with →. Ignore limit and before_message_id when message_id is set. Hide filtered messages by default. Set show_filtered=true to view them.", {
    bot: botSchema, chat_id: z.union([z.string(), z.number()]),
    limit: z.number().int().min(1).max(200).default(20), before_message_id: z.number().int().optional(),
    message_id: z.number().int().optional(), context: z.number().int().min(0).max(50).default(5),
    show_filtered: z.boolean().default(false),
  }, async ({ bot, chat_id, limit, before_message_id, message_id, context, show_filtered }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const store = openStore(dataDir, entry.id);
      return await store.withLock(async () => {
        const state = await store.read();
        const rules = await readFilters(store.dir);
        const chat = state.chats[chat_id];
        const saved = (chat?.messages ?? []).slice().sort((a, b) => a.message_id - b.message_id);
        let messages;
        const lines = [];
        if (message_id !== undefined) {
          const index = saved.findIndex((message) => message.message_id === message_id);
          messages = index === -1 ? [] : saved.slice(Math.max(0, index - context), index + context + 1)
            .map((message) => ({ message, prefix: message.message_id === message_id ? "→ " : "" }));
          const replyId = saved[index]?.reply_to_message_id;
          if (replyId !== undefined) {
            const original = saved.find((message) => message.message_id === replyId);
            if (!original) lines.push("原消息没有保存在本地。");
            else if (!messages.some(({ message }) => message.message_id === replyId)) {
              messages.unshift({ message: original, prefix: "原消息：" });
            }
          }
        } else {
          messages = saved.filter((message) => before_message_id === undefined || message.message_id < before_message_id)
            .slice(-limit).map((message) => ({ message, prefix: "" }));
        }
        const me = messages.length && !show_filtered ? await filterMe(entry, state) : {};
        const visible = messages.filter(({ message }) => show_filtered || classify(message, chat.chat, rules, me) !== "filtered");
        lines.push(...visible.map(({ message, prefix }) => prefix + formatMessage(message, chat.chat)));
        if (!lines.length) lines.push("No saved messages.");
        const hidden = messages.length - visible.length;
        if (hidden) lines.push(`已收起 ${hidden} 条。Set show_filtered=true to view them.`);
        const shown = new Set(visible.map(({ message }) => message.message_id));
        state.pending = state.pending.filter(([key, id]) => key !== String(chat_id) || !shown.has(id));
        await store.write(state);
        return plainTextResult(lines.join("\n"), tokens);
      });
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("get_filters", "Read the bot's message filter config. The result is for the AI. When you explain rules to the owner, use everyday language.", { bot: botSchema }, async ({ bot }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      return textResult(await readFilters(openStore(dataDir, entry.id).dir), tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("set_filters", "The owner must approve every add, change, or delete of a rule. Call without confirm first. Show the preview text to the owner as is. Point out the messages that might be hidden by mistake. Call with confirm=true only after the owner clearly agrees. Never add rules on your own. Read real saved messages with get_chat_messages first. Use specific rules: require several words or limit a rule to a chat or sender. Talk to the owner in everyday language. Do not mention technical words (regex, JSON, chat_id, file paths). Given fields replace saved fields. Omitted fields keep their saved value. Call get_filters first and pass the full new list. Protected words and messages for the owner are kept by default.", {
    bot: botSchema, confirm: z.boolean().default(false),
    default_mode: z.enum(["all", "for_me"]).optional(),
    ...Object.fromEntries(filterFields.filter((key) => key !== "exclude_rules").map((key) => [key, z.array(key.endsWith("chats") || key.endsWith("users")
      ? z.union([z.string(), z.number()]) : z.string()).optional()])),
    exclude_rules: z.array(z.object({ words: z.array(z.string()).optional(), pattern: z.string().optional(),
      chats: z.array(z.union([z.string(), z.number()])).optional(),
      users: z.array(z.union([z.string(), z.number()])).optional(), include_for_me: z.boolean().optional(),
    })).optional(),
  }, async ({ bot, confirm, ...fields }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const store = openStore(dataDir, entry.id);
      const current = await readFilters(store.dir);
      const next = { ...current, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) };
      for (const source of [...next.exclude_regex, ...next.include_regex,
        ...next.exclude_rules.map((rule) => rule.pattern).filter((pattern) => pattern !== undefined)]) new RegExp(source, "i");
      const state = await store.read();
      const { chats } = state;
      const summary = describeFilterChanges(current, next, chats);
      if (!summary) return plainTextResult("规则没有变化。", tokens);
      if (!confirm) {
        const me = await filterMe(entry, state);
        const hint = (current.default_mode ?? "all") !== next.default_mode ? ownerNamesHint(next, me) : "";
        return plainTextResult(`${summary}\n${previewFilterImpact(current, next, chats, me)}\n要保存这条规则吗？\n`
          + "AI: Show the text above to the owner. Call again with confirm=true only after the owner clearly agrees. Do not add rules by yourself. Point out the messages that might be hidden by mistake."
          + (hint ? `\n${hint}` : ""), tokens);
      }
      await writeFilters(store.dir, next);
      return plainTextResult(`已保存。\n${summary}\n如果有消息被误收，直接告诉我，我再改规则（改之前也会先问你）。`, tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("list_chats", "List saved chats. Return the newest chat first. Use chat_key for business chat history and send tools.", { bot: botSchema }, async ({ bot }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const state = await openStore(dataDir, entry.id).read();
      return textResult(Object.entries(state.chats).map(([chat_key, { chat, messages, business_connection_id, left }]) => ({ ...chat,
        chat_key, ...(business_connection_id ? { id: chat_key, business_connection_id } : {}),
        message_count: messages.length, last_message_date: messages.length ? Math.max(...messages.map((message) => message.date)) : null,
        ...(left ? { left: true } : {}),
      })).sort((a, b) => (b.last_message_date ?? -1) - (a.last_message_date ?? -1)), tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("get_webhook_info", "Get the bot's webhook status.", { bot: botSchema }, async ({ bot }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      return textResult(await callApi(entry.token, "getWebhookInfo", {}, { fetch, env }), tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("delete_webhook", "Show a preview. Remove the webhook only with confirm=true after the user agrees.", {
    bot: botSchema, drop_pending_updates: z.boolean().default(false), confirm: z.boolean().default(false),
  }, async ({ bot, drop_pending_updates, confirm }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const params = { drop_pending_updates };
      if (!confirm) return textResult({ preview: { bot_id: entry.id, method: "deleteWebhook", params },
        notice: "After deletion, the bot can use getUpdates. To delete, show this preview to the user. Call again with confirm=true after the user agrees.",
      }, tokens);
      return textResult(await callApi(entry.token, "deleteWebhook", params, { fetch, env }), tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });
  return server;
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const tokens = loadBots(process.env).map((entry) => entry.token);
  process.on("unhandledRejection", (error) => {
    console.error(errorMessage(error, tokens));
    process.exit(1);
  });
  process.on("uncaughtException", (error) => {
    console.error(errorMessage(error, tokens));
    process.exit(1);
  });
  await createServer().connect(new StdioServerTransport());
}
