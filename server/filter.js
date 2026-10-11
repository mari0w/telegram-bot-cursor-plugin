import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { chatKey } from "./store.js";

export const filterFields = ["allow_chats", "mute_chats", "exclude_keywords", "include_keywords",
  "exclude_regex", "include_regex", "allow_users", "block_users", "exclude_rules", "protected_words", "owner_names"];
const protectedWords = ["投诉", "退款", "急"];

export async function readFilters(dir) {
  const defaults = Object.fromEntries(filterFields.map((key) => [key, []]));
  defaults.protected_words = [...protectedWords];
  defaults.default_mode = "all";
  try {
    return { ...defaults, ...JSON.parse(await readFile(path.join(dir, "filters.json"), "utf8")) };
  } catch (error) {
    if (error.code === "ENOENT") return defaults;
    throw error;
  }
}

export async function writeFilters(dir, rules) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(dir, "filters.json.tmp");
  await writeFile(temp, JSON.stringify(rules), { mode: 0o600 });
  await rename(temp, path.join(dir, "filters.json"));
}

export function classify(message, chat, rules, me = {}, mode = rules.default_mode ?? "all") {
  const text = message.text ?? "";
  const lower = text.toLowerCase();
  const hasChat = (items) => items.some((id) => String(id) === chatKey(chat.id, message.business_connection_id));
  const hasUser = (items) => message.from && items.some((user) =>
    String(user) === String(message.from.id) || (message.from.username &&
      String(user).replace(/^@/, "").toLowerCase() === message.from.username.toLowerCase()));
  const matches = (prefix) => (rules[`${prefix}_keywords`] ?? []).some((word) => lower.includes(word.toLowerCase()))
    || (rules[`${prefix}_regex`] ?? []).some((source) => new RegExp(source, "i").test(text));
  const forMe = chat.type === "private"
    || (rules.owner_names ?? []).map((name) => name.replace(/^@/, "").toLowerCase())
      .some((name) => name && lower.includes(`@${name}`))
    || [me.username, ...(me.owner_usernames ?? [])].some((name) => name && lower.includes(`@${name.toLowerCase()}`))
    || (message.reply_to_from_id !== undefined && [me.id, ...(me.owner_ids ?? [])]
      .some((id) => id !== undefined && String(message.reply_to_from_id) === String(id)));
  const protectedText = (rules.protected_words ?? protectedWords).some((word) => lower.includes(word.toLowerCase()));
  if (hasUser(rules.block_users ?? []) || message.service === true || message.file?.kind === "sticker") {
    return "filtered";
  }
  if (!protectedText && ((!forMe && matches("exclude")) || (rules.exclude_rules ?? []).some((rule) =>
    (!forMe || rule.include_for_me === true)
    && (rule.words ?? []).every((word) => lower.includes(word.toLowerCase()))
    && (rule.pattern === undefined || new RegExp(rule.pattern, "i").test(text))
    && (rule.chats === undefined || hasChat(rule.chats))
    && (rule.users === undefined || hasUser(rule.users))))) return "filtered";
  if (hasChat(rules.mute_chats ?? [])) return "summary";
  if (mode === "all" || forMe || hasChat(rules.allow_chats ?? []) || hasUser(rules.allow_users ?? []) || matches("include")) return "full";
  return "summary";
}

const time = (date) => new Date(date * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";
const chatName = (chat) => chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ")
  || chat.username || String(chat.id);
const senderName = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(" ")
  || (from?.username ? `@${from.username}` : String(from?.id ?? "未知发送者"));

export function describeFilterChanges(current, next, chats) {
  const userName = (user) => {
    if (!/^\d+$/.test(String(user))) return String(user);
    for (const { messages } of Object.values(chats)) {
      const message = messages.find((item) => String(item.from?.id) === String(user));
      if (message) return senderName(message.from);
    }
    return String(user);
  };
  const names = (items) => items.map((id) => `「${chats[id] ? chatName(chats[id].chat) : id}」`).join("、");
  const words = (items) => items.map((word) => `『${word}』`).join("、");
  const ruleText = (rule) => ([
    rule.words?.length ? `同时包含${rule.words.map((word) => `『${word}』`).join("")}` : "",
    rule.pattern !== undefined ? `符合「${rule.pattern}」这种写法` : "",
  ].filter(Boolean).join("且") || "所有") + "的消息"
    + (rule.chats !== undefined ? `（只在${rule.chats.map((id) => `『${chats[id] ? chatName(chats[id].chat) : id}』`).join("、")}）` : "")
    + (rule.users !== undefined ? `（只针对 ${rule.users.map(userName).join("、")}）` : "");
  const descriptions = {
    exclude_keywords: [(items) => `以后包含${words(items)}的消息不再显示给你`,
      (items) => `恢复显示包含${words(items)}的消息`],
    include_keywords: [(items) => `群里包含${words(items)}的消息完整显示给你`,
      (items) => `取消群里包含${words(items)}的消息完整显示的规则`],
    exclude_regex: [(items) => items.map((item) => `符合「${item}」这种写法的消息不再显示`).join("。"),
      (items) => items.map((item) => `恢复显示符合「${item}」这种写法的消息`).join("。")],
    include_regex: [(items) => items.map((item) => `符合「${item}」这种写法的消息完整显示`).join("。"),
      (items) => items.map((item) => `取消符合「${item}」这种写法的消息完整显示的规则`).join("。")],
    block_users: [(items) => `不再显示 ${items.map(userName).join("、")} 发的消息`,
      (items) => `恢复显示 ${items.map(userName).join("、")} 发的消息`],
    allow_users: [(items) => `完整显示 ${items.map(userName).join("、")} 发的群消息`,
      (items) => `取消完整显示 ${items.map(userName).join("、")} 发的群消息的规则`],
    mute_chats: [(items) => `${names(items)}只显示新消息条数`,
      (items) => `取消${names(items)}只显示新消息条数的规则`],
    allow_chats: [(items) => `${names(items)}的消息全部完整显示`,
      (items) => `取消${names(items)}的消息全部完整显示的规则`],
    exclude_rules: [(items) => items.map((rule) => `${ruleText(rule)}不再显示给你`
      + (rule.include_for_me ? "。私聊和@你的消息也会收起" : "")).join("。"),
      (items) => items.map((rule) => `取消${ruleText(rule)}不再显示给你的规则`).join("。")],
    protected_words: [(items) => items.map((word) => `包含『${word}』的消息一定显示给你`).join("。"),
      (items) => items.map((word) => `『${word}』不再是一定显示的词`).join("。")],
    owner_names: [(items) => `以后把${words(items)}当作你的名字：别人 @ 这些名字的消息算给你的`,
      (items) => `${words(items)}不再当作你的名字`],
  };
  const lines = [];
  if ((current.default_mode ?? "all") !== (next.default_mode ?? "all")) {
    lines.push(next.default_mode === "for_me"
      ? "以后默认只完整显示给你的消息（私聊、@你、回复你），其他群消息只显示条数。"
      : "以后默认显示所有消息的全文。");
    if (next.default_mode === "for_me" && !next.owner_names?.length) {
      lines.push("还没有设置你的 Telegram 用户名，@你 的消息可能认不出来。");
    }
  }
  const same = (a, b) => typeof a === "object" || typeof b === "object"
    ? JSON.stringify(a) === JSON.stringify(b) : String(a) === String(b);
  for (const key of filterFields) {
    const before = current[key] ?? (key === "protected_words" ? protectedWords : []);
    const after = next[key] ?? (key === "protected_words" ? protectedWords : []);
    const added = after.filter((item) => !before.some((old) => same(old, item)));
    const removed = before.filter((item) => !after.some((value) => same(value, item)));
    if (added.length) lines.push(descriptions[key][0](added) + "。");
    if (removed.length) lines.push(descriptions[key][1](removed) + "。");
  }
  return lines.join("\n");
}

export function previewFilterImpact(current, next, chats, me) {
  let hidden = 0;
  let restored = 0;
  const examples = [];
  const possibleMistakes = [];
  for (const { chat, messages } of Object.values(chats)) {
    for (const message of messages) {
      const wasFiltered = classify(message, chat, current, me) === "filtered";
      const isFiltered = classify(message, chat, next, me) === "filtered";
      if (wasFiltered && !isFiltered) restored++;
      if (!wasFiltered && isFiltered) {
        hidden++;
        const text = Array.from((message.text ?? "").replace(/[\r\n]+/g, " "));
        const line = `${senderName(message.from)}（${chatName(chat)}）：${text.slice(0, 60).join("")}${text.length > 60 ? "…" : ""}`;
        if (examples.length < 3) examples.push(`- ${line}`);
        if (possibleMistakes.length < 3 && (Array.from(message.text ?? "").length > 100
          || /[?？]/.test(message.text ?? "") || chat.type === "private")) possibleMistakes.push(line);
      }
    }
  }
  return (hidden ? `按现在已保存的消息算，会多收起 ${hidden} 条。` : "按现在已保存的消息算，没有消息会被收起。")
    + (restored ? `会少收起 ${restored} 条。` : "")
    + (examples.length ? `\n例如：\n${examples.join("\n")}` : "")
    + (possibleMistakes.length ? `\n\n可能误收的消息（请看一下）：\n${possibleMistakes.join("\n")}` : "");
}

export function formatMessage(message, chat) {
  const text = (message.text ?? "").replace(/[\r\n]+/g, " ");
  const sender = message.from?.username ? `@${message.from.username}` : message.from?.first_name;
  const reply = message.reply_to_message_id === undefined ? "" : ` (reply to #${message.reply_to_message_id})`;
  const file = message.file ? ` [${message.file.kind}${message.file.file_name ? ` ${message.file.file_name}` : ""}]` : "";
  return `[${message.business_connection_id ? "business " : ""}${chat.type}] ${chatName(chat)} (chat ${chatKey(chat.id, message.business_connection_id)}) #${message.message_id} ${time(message.date)}`
    + `${sender ? ` ${sender}` : ""}${message.outgoing ? " (you)" : ""}${reply}${message.edited ? " (edited)" : ""}${sender ? ":" : ""}${file}${message.service === true ? " [service message]" : ""}`
    + `${text ? ` ${text.length > 500 ? text.slice(0, 500) + "…" : text}` : ""}`;
}

export function ownerNamesHint(rules, me, mode = rules.default_mode ?? "all") {
  if (mode !== "for_me" || rules.owner_names?.length) return "";
  const username = me.owner_usernames?.[0];
  return "AI: owner_names is empty. Ask the owner in plain words for their Telegram username. "
    + (username ? `Suggested value: @${username}. ` : "")
    + "Ask the owner to confirm it, then save it with set_filters (preview first).";
}

export function formatMessages({ bot_id, messages, chats, rules = {}, me = {}, offset, more = false, mode, pending = [] }) {
  const hint = ownerNamesHint(rules, me, mode);
  messages = messages.filter((message) => !message.outgoing);
  if (!messages.length) return `bot ${bot_id}: no new messages.`
    + (more ? "\nMore updates are waiting. Call read_new_messages again." : "")
    + (hint ? `\n${hint}` : "");
  const lines = [`bot ${bot_id}: ${messages.length} new messages. offset ${offset}.`];
  const summaries = new Map();
  let filtered = 0;
  for (const message of messages) {
    const key = chatKey(message.chat_id, message.business_connection_id);
    const chat = chats[key].chat;
    const kind = classify(message, chat, rules, me, mode);
    if (kind === "full") lines.push(formatMessage(message, chat));
    else if (kind === "filtered") filtered++;
    else {
      const summary = summaries.get(key) ?? { chat, key, business: !!message.business_connection_id,
        count: 0, last: message.date };
      summary.count++;
      summary.last = Math.max(summary.last, message.date);
      summaries.set(key, summary);
    }
  }
  if (summaries.size) {
    lines.push("Group summary:");
    for (const { chat, key, business, count, last } of summaries.values()) {
      lines.push(`- ${business ? `[business ${chat.type}] ` : ""}${chatName(chat)} (chat ${key}): ${count} new, last ${time(last)}`);
    }
  }
  if (filtered) lines.push(`已收起 ${filtered} 条。Call get_chat_messages with show_filtered=true to view them.`);
  if (more) lines.push("More updates are waiting. Call read_new_messages again.");
  if (pending.length) {
    lines.push(`还有 ${pending.length} 条没显示。再次调用 read_new_messages 显示下一批，或用 get_chat_messages 查看某个群。`);
    const counts = new Map();
    for (const [key] of pending) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, count] of counts) {
      lines.push(`- ${chatName(chats[key].chat)} (chat ${key}): 还有 ${count} 条`);
    }
  }
  if (hint) lines.push(hint);
  return lines.join("\n");
}
