#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadBots, selectBot } from "./bots.js";
import { callApi, errorMessage, redact } from "./telegram.js";
import { addMessage, addUpdates, openStore } from "./store.js";

const botSchema = z.string().optional().describe("Bot username (with or without @) or numeric bot ID from list_bots. Omit for the default bot (TELEGRAM_BOT_TOKEN).");
const RATE_REMINDER = "Reminder: Telegram limits: in one chat, avoid more than 1 message per second; in one group, no more than 20 messages per minute; for bulk notifications, about 30 messages per second at most. Over the limit, Telegram returns 429 with retry_after. Bots that share one token share these limits.";

function textResult(obj, tokens = []) {
  return { content: [{ type: "text", text: redact(JSON.stringify(obj, null, 2), tokens) }] };
}

function errorResult(error, tokens) {
  return { content: [{ type: "text", text: `Error: ${errorMessage(error, tokens)}` }], isError: true };
}

export function createServer({ env = process.env, fetch, dataDir } = {}) {
  const server = new McpServer({ name: "telegram-bot", version: "0.3.0" });
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

  const send = async (method, { bot, confirm, ...params }, notice) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const store = openStore(dataDir, entry.id);
      if (!confirm) {
        const state = await store.read();
        return textResult({ sent: false, preview: { bot_id: entry.id,
          chat: state.chats[params.chat_id]?.chat ?? null, method, params },
          notice: `${notice} Show this preview to the user. Call again with confirm=true after the user agrees.`,
          rate_reminder: RATE_REMINDER }, tokens);
      }
      const result = await callApi(entry.token, method, params, { fetch, env });
      const response = { ...(result === true ? (method === "deleteMessage" ? { deleted: true } : { ok: true }) : result),
        rate_reminder: RATE_REMINDER };
      try {
        await store.withLock(async () => {
          const state = await store.read();
          if (method === "deleteMessage") {
            const chat = state.chats[params.chat_id];
            if (chat) chat.messages = chat.messages.filter((message) => message.message_id !== params.message_id);
          } else if (result !== true) {
            addMessage(state, JSON.parse(redact(JSON.stringify(result), tokens)), { edited: method === "editMessageText" });
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

  server.tool("send_message", "Send text as the bot. Show a preview first. Set confirm=true only after the user agrees. Remind the user of rate limits before bursts or bulk sends. Text must be 1-4096 characters after entity parsing. On 429, stop and wait retry_after seconds.", {
    bot: botSchema, confirm: z.boolean().default(false), chat_id: z.union([z.string(), z.number()]),
    text: z.string().min(1), parse_mode: z.enum(["HTML", "MarkdownV2"]).optional(),
    reply_to_message_id: z.number().int().optional(), disable_notification: z.boolean().optional(),
  }, async ({ reply_to_message_id, ...args }) => send("sendMessage", {
    ...args, ...(reply_to_message_id === undefined ? {} : { reply_parameters: { message_id: reply_to_message_id } }),
  }, "The bot sends this as itself. Others in the chat can see it."));

  server.tool("edit_message", "Edit message text. Show a preview first. Set confirm=true only after the user agrees. Remind the user of rate limits before bursts or bulk sends. Text must be 1-4096 characters after entity parsing. On 429, stop and wait retry_after seconds.", {
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

  server.tool("list_bots", "List configured bots. Return bot IDs and names without tokens.", {}, async () => {
    try {
      const results = [];
      for (const entry of bots) {
        const info = { number: entry.number, id: entry.id, default: entry.default };
        try {
          const { username, first_name } = await getMe(entry);
          results.push({ ...info, username, first_name, ok: true });
        } catch (error) {
          results.push({ ...info, ok: false, error: errorMessage(error, tokens) });
        }
      }
      return textResult(results);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("get_me", "Get the selected bot's details.", {
    bot: botSchema,
  }, async ({ bot }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const { id, username, first_name, can_join_groups, can_read_all_group_messages, supports_inline_queries } = await getMe(entry);
      return textResult({ id, username, first_name, can_join_groups, can_read_all_group_messages,
        supports_inline_queries, number: entry.number, default: entry.default });
    } catch (error) {
      return errorResult(error, tokens);
    }
  });
  server.tool("read_new_messages", "Read new messages once and save them. Telegram keeps updates for 24 hours only.", {
    bot: botSchema, timeout: z.number().int().min(0).max(50).default(0),
  }, async ({ bot, timeout }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const store = openStore(dataDir, entry.id);
      return await store.withLock(async () => {
        const state = await store.read();
        const resetOffset = state.last_update_at === undefined ? state.offset > 0
          : Math.floor(Date.now() / 1000) - state.last_update_at >= 7 * 24 * 60 * 60;
        const updates = await callApi(entry.token, "getUpdates", {
          ...(resetOffset ? {} : { offset: state.offset }), timeout, limit: 100,
          allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"],
        },
          { fetch, env, timeoutMs: (timeout + 10) * 1000 });
        const messages = addUpdates(state, JSON.parse(redact(JSON.stringify(updates), tokens)));
        await store.write(state);
        return textResult({ bot_id: entry.id, count: messages.length, messages,
          offset: state.offset, more: updates.length === 100 }, tokens);
      });
    } catch (error) {
      if (error.code === 409) {
        error = new Error(`Telegram returned 409 Conflict. A webhook is set for this bot, or another process polls this bot. Call get_webhook_info to check. Call delete_webhook with confirm=true to remove the webhook. ${errorMessage(error, tokens)}`);
      }
      return errorResult(error, tokens);
    }
  });

  server.tool("get_chat_messages", "Read saved messages for one chat. Return the oldest message first.", {
    bot: botSchema, chat_id: z.union([z.string(), z.number()]),
    limit: z.number().int().min(1).max(200).default(20), before_message_id: z.number().int().optional(),
  }, async ({ bot, chat_id, limit, before_message_id }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const state = await openStore(dataDir, entry.id).read();
      const chat = state.chats[chat_id];
      const messages = (chat?.messages ?? []).filter((message) =>
        before_message_id === undefined || message.message_id < before_message_id)
        .sort((a, b) => a.message_id - b.message_id).slice(-limit);
      return textResult({ chat: chat?.chat ?? null, messages }, tokens);
    } catch (error) {
      return errorResult(error, tokens);
    }
  });

  server.tool("list_chats", "List saved chats. Return the newest chat first.", { bot: botSchema }, async ({ bot }) => {
    try {
      const entry = await selectBot(bots, bot, getUsername);
      const state = await openStore(dataDir, entry.id).read();
      return textResult(Object.values(state.chats).map(({ chat, messages }) => ({ ...chat,
        message_count: messages.length, last_message_date: Math.max(...messages.map((message) => message.date)),
      })).sort((a, b) => b.last_message_date - a.last_message_date), tokens);
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
