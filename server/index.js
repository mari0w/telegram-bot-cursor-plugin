#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadBots, selectBot } from "./bots.js";
import { callApi, errorMessage } from "./telegram.js";

function textResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function errorResult(error, tokens) {
  return { content: [{ type: "text", text: `Error: ${errorMessage(error, tokens)}` }], isError: true };
}

export function createServer({ env = process.env, fetch } = {}) {
  const server = new McpServer({ name: "telegram-bot", version: "0.1.0" });
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
    bot: z.string().optional().describe("Bot username (with or without @) or numeric bot ID from list_bots. Omit for the default bot (TELEGRAM_BOT_TOKEN)."),
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
