# Telegram Bot

Telegram Bot lets you use your Telegram bot through the AI in Cursor.
Ask the AI to read messages, send messages, or send files.
You can also ask it to edit, delete, or forward a message.
It can download files and show chat details.
It can show chat administrators.
It can pin messages and change the bot's command menu.

## Set up your bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot`.
3. Choose a name for your bot.
4. Choose a username for your bot.
5. Copy the bot key that BotFather gives you.
6. Open Configure for this plugin.
7. Paste the bot key there.
8. Send `/setprivacy` to BotFather. Select your bot. Choose **Disable**. This step is required.
9. Remove the bot from groups it has already joined. Add it again for this change to take effect.

Keep the bot key private.
Anyone with the bot key can control your bot.
Do not paste it into a conversation with the AI.

You can connect up to five bots.
The first bot is the default bot.
Ask the AI to list your bots.
Name the bot you want to use when you have more than one.

Send your bot a message in Telegram to start a chat.
Add your bot to a group if you want it to read group messages.

## Let the bot help you read your own messages (Telegram Business)

1. Create a bot in [@BotFather](https://t.me/BotFather). Use the setup steps above.
2. In BotFather, open your bot's settings. Turn on **Secretary Mode**. Older guides call it Business Mode. See [Business Bots](https://core.telegram.org/bots/features#business-bots).
3. Send `/setprivacy` to BotFather. Select your bot. Choose **Disable**. This step is required.
4. In Telegram, open **Settings > Telegram Business > Chatbots**. Add your bot. Choose which chats it can see. Allow it to reply.
5. Add the bot to the groups you want it to read. If it was in a group before you disabled privacy mode, remove it and add it again. This is required for the change to take effect. See [Privacy Mode](https://core.telegram.org/bots/features#privacy-mode).
6. Ask the AI: “Read my new messages. Give me a daily summary and a to-do list.”

Telegram Premium is no longer needed for business bots.
Bot API 10.0 removed this requirement. See the [Bot API changelog](https://core.telegram.org/bots/api-changelog).

The plugin never marks messages as read.
Messages you send are saved as context for replies.
They are not shown or counted as new incoming messages.
Your message filters also apply to business chats.

Messages sent in these chats go out as you.
The AI shows a preview and waits for your agreement before it sends.
The bot can reply only in private chats that had incoming messages in the last 24 hours.
See [BusinessBotRights](https://core.telegram.org/bots/api#businessbotrights).

Ask the AI to check the bot's setup if messages are missing.
It can tell you which steps you still need to complete.

## Read messages

Ask the AI: “Read my new Telegram messages.”
插件运行时，会自动在后台获取新消息。
默认每 2 分钟检查一次。
这是默认行为。普通使用者不用改设置。
Background fetch starts when the plugin starts.
Ask the AI to show saved new messages when you need them.
The AI only reads what is already saved locally.
It does not pull from Telegram by itself.
Each read shows up to 200 messages by default.
It shows only messages that have not yet been summarized here.
It never marks messages as read on Telegram.
Reading chat history does not change this progress.

消息会自动保存在本机的 SQLite 数据库中。
不需要另外安装数据库。
旧消息会自动迁移。
后台默认只保存文字，以及图片或附件的引用。
它不会把图片或文件提前下载到本机。
需要看图或下载附件时，再让 AI 按那条消息去下载。

If the result says 「还有 N 条没显示」, ask the AI to show the next page.
The result also shows how many messages remain in each chat.
You can ask for messages from one group instead.

You see the full text of all readable messages by default.
This includes private chats, business private chats, and all groups.
Chats set to show counts only still show the new message count and the last message time.
Channels use the same display rules as groups.

Ask the AI to show only messages for you in full for one read.
It uses `read_new_messages` with `mode="for_me"`.
Private chats, messages that @ you, and replies to your account show in full.
Here, @ means @ you. Mentions of your bot and replies to your bot also count.
Tell the AI which usernames or names count as yours. Names can have an @ prefix.
Replies to you are found through your account in a known Business connection.
Allowed chats, allowed users, and include matches also show in full.
Other group messages show one count line per group.
To make this the default, the AI previews `set_filters` with `default_mode="for_me"`.
It saves the change only after you agree.
If your names are not set, the AI asks for your Telegram username.
Open Telegram Settings. Find the username under your name.
If a Business connection has your username, the AI suggests it and asks you to confirm it.
The AI shows a preview of the names and saves them only after you agree.

群通知和贴纸默认收起。
条数会显示为「已收起 N 条。」。
File messages show the file type.
Messages that were edited have a mark.
Long messages are shortened on screen.

Ask the AI to list saved chats.
Groups the bot joined before the plugin went live appear in the list only after someone sends a message there.
Then ask it to show messages from a chat.
It shows saved messages from that chat in full.
被规则收起的消息仍会保存。你可以随时要求查看。
Ask the AI to show the context of a message.
It can show the original message being replied to, the selected message, and nearby saved messages.
It reads five messages before and after by default.
If a mention of you or a reply to you is unclear, the AI reads this context before it asks you.

## Daily summary

Ask the AI: “Read my new messages. Give me a daily summary and a to-do list.”

1. Let the AI read each page until 「还有 N 条没显示」 is gone. If you stop early, keep the remaining counts for each group.
2. Check the message count for each group.
3. Let the AI read important groups in batches.
4. Let the AI write the summary and the to-do list.

Keep the plugin running with background fetch on.
Telegram drops updates older than 24 hours.

## Choose which messages to see

用平常的话告诉 AI 你想看哪些消息。例如：

- “运营群里同时包含订单和查单的消息，不再显示给我。”
- “只收起张三在运营群发的查单消息。”
- “运营群只告诉我有多少条新消息。”
- “运营群的消息都显示给我。”
- “包含投诉的消息一定显示给我。”
- “恢复显示被收起的订单消息。”
- “告诉我现在有哪些显示规则。”

AI 会先读你已保存的真实消息，再提出具体规则。
它应使用几个必须同时出现的词，或把规则限于一个群或一个人。
消息的判断在你的电脑上完成，只按规则匹配，不由 AI 判断，也不使用外部服务。

默认保留包含“投诉”“退款”“急”的消息，排除规则不会收起它们。
默认保留私聊，包括你连接的个人聊天。
@机器人、@你、回复机器人或回复你的消息也默认保留。
普通词语规则不会收起这些消息。
只有你同意一条明确包含这些消息的规则，它们才可能被收起。
屏蔽的人发来的消息、群通知和贴纸仍会收起。
设为只显示条数的聊天仍只显示条数。

增加、修改或删除规则前，AI 都会先问你。
预览使用中文，只说明本次变更。
它会按所有已保存的消息计算：「按现在已保存的消息算，会多收起 N 条。」
它还会说明恢复的条数，并最多给出三条例子。
长消息、带问号的消息或私聊若将被收起，会另列在「可能误收的消息（请看一下）：」中，最多三条。
AI 会指出可能误收的消息。预览不会保存规则。
只有你明确同意后，AI 才会保存。AI 不能自行添加规则。
如果有消息被误收，直接告诉 AI。它会先预览修改，再等你同意。

这些规则只改变显示方式，不会删除 Telegram 消息。
被收起的消息仍会保存。
你可以说：“给我看运营群里被收起的消息。”
也可以说：“给我看这条消息的原消息和前后消息。”
长消息在屏幕上仍会缩短。

## Send messages and files

Ask the AI to read the chat before it prepares a reply.
Ask it to send text, a photo, or another file.
You can give it a file from your computer or a web link.
It can also reuse a file that the same bot received.

The AI shows a preview before it sends anything.
It waits for your agreement.
The same process applies to editing, deleting, or forwarding messages.
In a normal bot chat, your bot sends as itself.
In a business chat, it sends as you after you agree.
Other people in the chat can see what it sends.

You can add a caption or reply to a message.
You can ask to send without a notification sound.
Ask the AI to download a received file to your computer.
Background fetch does not download files for you.
It only saves a reference for later.
Downloading a file does not need approval.

A photo from your computer can be up to 10 MB.
Another file from your computer can be up to 50 MB.
A photo from a web link can be up to 5 MB.
Another file from a web link can be up to 20 MB.
Telegram accepts document links for PDF and ZIP files.
The plugin checks the size of files from your computer before sending.
It does not check the size of files from web links.
A file download can be up to 20 MB.

You can also ask for chat details or the chat administrators.
These requests do not need approval.
Ask to pin a message or remove a pin.
The AI asks before it makes the change.
Your bot needs permission to pin messages in that chat.
The AI also asks before it changes the command menu.

## Limits to remember

Your bot cannot start a private chat with someone.
That person must contact the bot first.
Connect the bot through Telegram Business to let it reply as you in the chats you choose.
It can delete only messages sent less than 48 hours ago.

Telegram keeps pending updates for no more than 24 hours.
Keep the plugin running with background fetch on to avoid losing them.
The plugin keeps the last 2000 saved messages from each chat.

Telegram limits which group messages a bot can receive by default.
It receives commands meant for it and replies meant for it.
It also receives group notices.
You must turn off privacy mode during setup to receive other group messages.
A bot that is a group administrator receives all group messages.
Your bot receives all private messages sent to it.
It receives all messages in channels where it is a member.

Avoid sending more than one message per second to one chat.
Send no more than 20 messages per minute to one group.
For messages to many people, send no more than about 30 messages per second.
Paid broadcasts have a different limit.
The plugin reminds you of these limits.
It does not slow down messages for you.
If Telegram says to wait, stop sending for the time it gives you.
Bots with the same bot key share these limits.

Only one app can receive new messages for a bot at a time.
If another app uses your bot, receiving messages here can fail.
The AI can check this and explain the next step.
It asks before it removes an existing connection.

Messages and downloaded files are saved on your computer.
The bot key is not saved with messages.
The plugin hides bot keys in results and error reports.
If a send succeeds but saving the message fails, do not send it again.

## Technical details

The following reference is for setup, tools, and maintenance.

Version 1.2.0 uses the Telegram Bot API through an MCP server in Cursor.
It receives, sends, edits, deletes, and forwards messages.
It sends and downloads files.
It reads chat details and administrators.
It manages pins, command menus, and webhooks.
It uses Bot API only.
It does not use MTProto or a user login.

### Create a bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot`.
3. Set a name.
4. Set a username.
5. Get the token from BotFather.

See the [BotFather guide](https://core.telegram.org/bots/features#botfather).

### Configure tokens

Set tokens in plugin Configure or in the MCP environment.
`TELEGRAM_BOT_TOKEN` sets bot 1 as the default bot.
Extra bots use `TELEGRAM_BOT_TOKEN_2` through `TELEGRAM_BOT_TOKEN_5`.
You can set up to five bots.
Gaps are allowed.
Blank values and whole `${...}` values count as unset.
Calls that omit `bot` need `TELEGRAM_BOT_TOKEN`.

### Select a bot

Call `list_bots` first.
Set `bot` to a username, with or without `@`, or a numeric bot ID.
Username matching ignores case.
Omit `bot` to use bot 1.
An unknown bot returns an error.
The server does not switch to the default bot after this error.

### Proxy

The server uses proxy environment values without extra plugin settings.
It checks these values in order:

1. `SAND_EGRESS_TUNNEL_PROXY_ADDR`
2. `HTTPS_PROXY`
3. `https_proxy`
4. `HTTP_PROXY`
5. `http_proxy`
6. `ALL_PROXY`
7. `all_proxy`

It skips blank values.
It adds `http://` if the address has no scheme.
It connects directly if no proxy is set.
It does not use `NO_PROXY`.

### Security

A token gives full control of the bot.
Do not commit a token.
Do not paste a token into chat.
The server removes tokens from errors and error logs.
The tools do not return tokens.

### Tools in 1.2.0

| Tool | Use |
| --- | --- |
| `list_bots` | List bots, settings, API status, missing setup steps, and the next step. |
| `get_me` | Get bot settings and refresh known business connections. Return missing setup steps and the next step. |
| `read_new_messages` | Show saved messages that have not yet been summarized. Show all readable messages in full by default. Set `mode="for_me"` for group summaries. Omit `mode` to use the saved default. The `timeout` field is kept but does not wait for Telegram. Set `limit` to 1–1000 messages per page (default 200). |
| `list_chats` | List saved chats, with the newest chat first. |
| `get_chat_messages` | Read saved messages for one chat as compact text. Use `limit` and `before_message_id`, or `message_id` and `context` for nearby messages and the original reply message. Set `show_filtered=true` to show filtered messages. |
| `get_filters` | Read the bot's message filter config for the AI. Explain rules to the owner in everyday language. |
| `set_filters` | Preview rule or `default_mode` changes in plain Chinese. Save only with `confirm=true` after the owner clearly agrees. |
| `send_message` | Preview and send text as the bot or business account owner. |
| `edit_message` | Preview and edit message text. |
| `delete_message` | Preview and delete a message sent less than 48 hours ago. |
| `forward_message` | Preview and forward a message to a target chat. |
| `send_photo` | Preview and send a photo from a local file, URL, or Telegram file ID. |
| `send_document` | Preview and send a document from a local file, URL, or Telegram file ID. |
| `download_file` | Download a Telegram file and return its local path and file details. |
| `get_chat` | Get current chat details from Telegram. |
| `get_chat_admins` | Get the chat's administrators from Telegram. |
| `pin_message` | Preview and pin a chat message. |
| `unpin_message` | Preview and unpin a message. Omit `message_id` to remove the most recent pin. |
| `get_commands` | Get the bot's command menu. |
| `set_commands` | Preview and set the bot's command menu. |
| `get_webhook_info` | Get the bot's webhook status. |
| `delete_webhook` | Show a preview. Remove the webhook with `confirm=true` after the user agrees. |

### Receive messages

Only the background poller calls `getUpdates`.
It starts with the plugin process and checks each configured bot.
It uses `timeout=0` and a 10-second request timeout.
Each call requests at most 100 updates.
Each cycle makes at most 20 calls per bot.
It saves each batch before the next request.
It uses the same API and proxy fallback as the tools.
It skips a bot if its last poll is still running or the store is locked.
The next cycle fetches any remaining updates.
Errors go to stderr with bot tokens removed.
A failed poll does not stop the process.
The timer stops when the server closes.
Most other API calls and file downloads use a 15-second request timeout.

`read_new_messages` reads only local messages that have not yet been summarized.
Its `timeout` field remains an integer from 0 to 50 for compatibility.
The field does not wait for Telegram.
This stays true when background fetch is off.
The poller stores messages, edits, channel posts, and business updates.
Business deletion updates remove saved messages.
Call `list_chats` to find saved chats.
Call `get_chat_messages` to read messages for one chat.
Message lines show the sender name (first name and last name).
If the sender has a username, the line adds it in parentheses, such as `婷婷 (@Ting10086)`.
Without a name, the line shows `@username` or the user ID.

`read_new_messages` shows the next page of local unsummarized messages.
Set `limit` to an integer from 1 to 1000. The default is 200.
The header counts messages in this page. Current modes and filters apply to the page.
The tool marks only the page entries as summarized in SQLite.
A call shows the next saved page without fetching updates.
Deleted messages and messages no longer in storage are skipped.
If entries remain, the result says 「还有 N 条没显示。再次调用 read_new_messages 显示下一批，或用 get_chat_messages 查看某个群。」.
The next lines give the remaining count for each chat, such as `- 销售群 (chat -1002): 还有 120 条`.

For a daily summary:

1. Call `read_new_messages` until 「还有 N 条没显示」 is gone. If you stop early, note the remaining counts for each group.
2. Check the message count for each group.
3. Read important groups in batches with `get_chat_messages`. Use `limit` and `before_message_id` to read earlier batches.
4. Write the summary and the to-do list.

Keep background fetch on. Telegram drops updates older than 24 hours.

Set `message_id` on `get_chat_messages` to read the context of one saved message.
Set `context` to an integer from 0 to 50. It defaults to 5 messages on each side.
The first line shows the saved message it replies to with 「原消息：」.
If it has a reply ID but the original is not saved, the first line says 「原消息没有保存在本地。」.
The next lines show the messages before it, the selected message with 「→ 」, and the messages after it, oldest first.
All messages come from the same chat in local storage.
The tool ignores `limit` and `before_message_id` when `message_id` is set.
Filter hiding and the 500-character cut still apply.
Set `show_filtered=true` to show hidden messages too.

### Message filter

`read_new_messages` returns compact text.
The initial default mode is `all`.
It shows all readable messages in full: private chats, business private chats, groups, supergroups, and channels.
Set `mode="for_me"` for one call to show only messages for the owner, allowed chats, allowed users, and include matches in full.
Private chats, including business private chats, are messages for the owner.
An owner mention is text that contains `@` plus an entry in `owner_names`, with its leading `@` removed, or the real username of a known Business connection owner. Matching ignores case.
Plain name entries also match text that contains `@` plus the name.
Replies to the owner match only the owner's `user_id` from a known Business connection.
Mentions of the bot and replies to the bot also count.
In `for_me` mode, other group, supergroup, and channel messages use one summary line per chat.
The summary line shows the new message count and the last message time.
Muted chats use a summary line only.
Their message content is not shown.
Service messages, stickers, exclude matches, and messages from blocked users are filtered.
Messages that are 收起 are counted only.
`read_new_messages` says 「已收起 N 条。Call get_chat_messages with show_filtered=true to view them.」.
`get_chat_messages` says 「已收起 N 条。Set show_filtered=true to view them.」.
Text longer than 500 characters is cut to 500 characters plus `…`.
Newlines in message text become spaces.
File messages show a file marker.
Edited messages show `(edited)`.
All received messages are saved, including filtered messages.

Omit `mode` to use the saved `default_mode`.
Change it with `set_filters` using `default_mode="all"` or `default_mode="for_me"`.
Show the preview and save with `confirm=true` only after the owner agrees.
In `for_me` mode, an empty `owner_names` adds one final line, even when there are no new messages:
`AI: owner_names is empty. Ask the owner in plain words for their Telegram username. Suggested value: @<business owner username>. Ask the owner to confirm it, then save it with set_filters (preview first).`
The `Suggested value` sentence is present only when a known Business connection has a username.
The AI asks the owner to open Telegram Settings and find the username under their name.
It offers the Business username when available, asks the owner to confirm it, then previews and saves `owner_names` only after the owner agrees.
Both modes keep muted chats as summaries and apply all hiding rules.
`get_chat_messages` shows full lines for the selected chat, including muted chats.
It hides filtered messages by default.
Set `show_filtered=true` to view filtered messages.

The server saves each bot's config in `~/.telegram-bot-cursor-plugin/<bot ID>/filters.json`.
It creates the bot directory with mode `0700` and the config file with mode `0600`.
A missing config file uses `default_mode: "all"` and empty arrays except for `protected_words`.
A missing `default_mode` field also uses `"all"`.
A missing file or missing `protected_words` field uses `["投诉", "退款", "急"]`.
Set `protected_words: []` to remove this protection.
All filtering uses local fixed rules. It does not use AI judgment or an external service.

| Field | Use |
| --- | --- |
| `default_mode` | Use `"all"` or `"for_me"` when `read_new_messages` omits `mode`. Default: `"all"`. |
| `owner_names` | Owner usernames, with or without `@`, or names. Match text that contains `@` plus a name, ignoring case. Default: `[]`. |
| `allow_chats` | Show messages from these chat IDs in full. |
| `mute_chats` | Show only a summary line for these chat IDs. |
| `exclude_keywords` | Filter text that contains any of these keywords. Matching ignores case. |
| `include_keywords` | Show text that contains any of these keywords in full. Matching ignores case. |
| `exclude_regex` | Filter text that matches any of these JavaScript RegExp sources. Use flag `i`. |
| `include_regex` | Show text that matches any of these JavaScript RegExp sources in full. Use flag `i`. |
| `allow_users` | Show messages from these sender user IDs or usernames in full. |
| `block_users` | Filter messages from these sender user IDs or usernames. |
| `exclude_rules` | Apply combined conditions: all words, a pattern, listed chats, and listed senders. |
| `protected_words` | Keep text with any listed word from all exclude rules. Default: `["投诉", "退款", "急"]`. |

All config fields except `default_mode` are arrays.
`owner_names` is an array of strings. A missing field uses `[]`.
Chat IDs can be numbers or strings.
Chat IDs compare as strings.
User IDs can be numbers or strings.
Usernames can have an `@` prefix.
Username matching ignores case.
Keywords match substrings of message text, including captions.
The server checks regex sources before it saves the config.

An `exclude_rules` item is `{ words?: string[], pattern?: string, chats?: (string|number)[], users?: (string|number)[], include_for_me?: boolean }`.
All given conditions must match: words AND pattern AND chat AND sender.
All words must appear as substrings. Matching ignores case.
The pattern uses JavaScript RegExp with flag `i` and is checked before saving.
Chat and sender lists match any listed entry. Use business chat keys for business chats.
Simple keyword and regex exclusions never put away messages for the owner.
Only an `exclude_rules` item with `include_for_me: true` can put away these messages.
Protected words stop all exclude rules, including those with `include_for_me: true`.

Apply rules in this order:

1. Filter messages from blocked users, service messages, and stickers.
2. Apply exclude matches, subject to protected words and messages for the owner.
3. Show only a summary line for muted chats.
4. In `all` mode, show all remaining messages in full.
5. In `for_me` mode, show messages for the owner, allowed chats, allowed users, and include matches in full. Show other messages in a group summary.

To change rules:

1. Read real saved messages with `get_chat_messages`.
2. Call `get_filters` for the bot.
3. Call `set_filters` with the changed fields to get a preview.
4. Show the preview as is. Point out messages that might be hidden by mistake.
5. Wait for the owner to clearly agree.
6. Call `set_filters` with the same fields and `confirm=true`.

Given fields replace the saved values.
Omitted fields keep their saved values.
Use an empty array to clear an array field.
To add keywords, read the current config first.
Pass the full new list.
Use specific rules. Do not choose a single common word.
For example, require both `订单` and `查单` in `exclude_rules.words`, and limit the rule to the requested group.
Choose the rule from real saved messages. Keep existing items in the list.
Use the preview and agreement flow before saving.
The owner must approve every addition, change, or deletion of a rule.
Never add rules on your own.
Use everyday language when discussing filters with the owner.
Do not reveal regex, JSON, chat IDs, or file paths.
The `get_filters` result is for the AI.

Without `confirm=true`, `set_filters` does not write the config.
Its tool result is plain Chinese text.
It describes added and removed items only.
For `default_mode="for_me"`, it says 「以后默认只完整显示给你的消息（私聊、@你、回复你），其他群消息只显示条数。」.
For `default_mode="all"`, it says 「以后默认显示所有消息的全文。」.
When the default changes to `for_me` and `owner_names` stays empty, the preview includes the same AI hint.
It also tells the owner 「还没有设置你的 Telegram 用户名，@你 的消息可能认不出来。」.
Added owner names use 「以后把『…』当作你的名字：别人 @ 这些名字的消息算给你的。」.
Removed owner names use 「『…』不再当作你的名字。」.
Known chats use their saved names.
Users use the given username or a saved sender name for a matching ID.
Unknown chats and users use their IDs.
The preview classifies all locally saved messages with both sets of rules.
It uses `owner_names`, the bot ID and username, and known owner IDs and usernames, as both message read tools do.
It counts messages that become filtered and messages that stop being filtered.
It shows up to three messages that become filtered.
Each example shows the sender name, chat name, and about 60 characters of text.
It says “按现在已保存的消息算，会多收起 N 条。”, including when N is zero.
It also reports restored messages with “会少收起 N 条。” when needed.
A separate “可能误收的消息（请看一下）：” block shows up to three new matches
that have more than 100 characters, contain `?` or `？`, or come from private chats.
Omit this block when no such message becomes 收起.
The owner-facing text ends with “要保存这条规则吗？”
A separate final `AI:` line tells the AI to wait for clear owner approval and point out possible mistakes.
With `confirm=true`, the result is “已保存。”, the change summary, and
“如果有消息被误收，直接告诉我，我再改规则（改之前也会先问你）。”
If no rule changes, the result is “规则没有变化。”
No file is written in that case.

### Send messages

Read the chat with `get_chat_messages` first.
Call the send, edit, delete, or forward tool without `confirm` to get a preview.
Show the preview to the user.
Call the same tool with `confirm=true` only after the user agrees.
The bot sends as itself in normal bot chats.
It sends as the owner when you use a business chat key.
Others in the chat can see the message.
Set `parse_mode` to `HTML` or `MarkdownV2` for send or edit.
Omit `parse_mode` for plain text.
The plugin does not offer legacy `Markdown`.
Set `reply_to_message_id` to reply to a message.
The plugin sends this value in `reply_parameters.message_id`.
Text must be 1-4096 characters after entity parsing.
See [sendMessage](https://core.telegram.org/bots/api#sendmessage).
Telegram can delete only messages sent less than 48 hours ago.
See [deleteMessage](https://core.telegram.org/bots/api#deletemessage).
Sent, edited, and forwarded messages are saved locally.
Thus, `get_chat_messages` shows both sides of the chat.
Deleted messages are removed from local storage.
If the result has `store_error`, the Telegram action succeeded but the local save failed.
Do not repeat the action to fix a local save error.

#### The bot cannot start a chat

The bot cannot start a chat with a user.
The user must send it a message first or add it to a group.
See [Telegram bots](https://core.telegram.org/bots).

### Send files

Use `send_photo` for photos.
Use `send_document` for other files.
Set `file` to an existing local file path, an HTTP(S) URL, or a Telegram `file_id`.
Use a file ID from the saved message shown by the tools.
Use the same bot that received the file ID.
The server uploads local files with their file names.
It passes URLs and file IDs to Telegram.

Telegram sets these size limits:
See [Sending files](https://core.telegram.org/bots/api#sending-files).

| Source | Photo | Other files |
| --- | --- | --- |
| Local upload | 10 MB | 50 MB |
| HTTP(S) URL | 5 MB | 20 MB |

The plugin checks local file size in the preview and before sending.
It returns an error if the file exceeds the upload limit.
It does not check URL file size.
Telegram supports document URLs for PDF and ZIP files.
See [Sending files](https://core.telegram.org/bots/api#sending-files).

Call the tool without `confirm` to get a preview.
The preview shows the source, local file size, and send values.
Show the preview to the user.
Call the same tool with `confirm=true` only after the user agrees.
The preview does not send the file.
Set `caption` to add text.
Captions must have 0-1024 characters after entity parsing.
See [sendPhoto](https://core.telegram.org/bots/api#sendphoto) and [sendDocument](https://core.telegram.org/bots/api#senddocument).
Set `parse_mode` to `HTML` or `MarkdownV2` to format the caption.
Set `reply_to_message_id` to reply to a message.
Set `disable_notification=true` to send without a notification sound.
The server saves the returned message and file details locally.

### Download files

Call `download_file` with the bot and `file_id`.
This tool does not need `confirm`.
Telegram allows bot downloads up to 20 MB.
See [getFile](https://core.telegram.org/bots/api#getfile).
The tool returns `path`, `file_size`, and Telegram's `file_path`.
It returns a local path only.
It does not return the download URL or token.
The server uses the same proxy settings as other API calls.
It saves files under `~/.telegram-bot-cursor-plugin/<bot ID>/files/`.
It prefixes each file name with Telegram's unique file ID to avoid name conflicts.
It creates the directory with mode `0700` and each file with mode `0600`.
To clear downloads, delete the bot's `files` directory.
To clear all saved data, delete the bot directory.

### Chat info and pinning

Call `get_chat` with `chat_id` to get current chat details.
Call `get_chat_admins` with `chat_id` to get the administrators.
These tools read from Telegram.
They do not need `confirm`.
They do not change local message storage.

Call `pin_message` with `chat_id` and `message_id` to get a preview.
Set `disable_notification=true` to pin without a notification.
Call `unpin_message` with `chat_id` and `message_id` to preview removal of a specific pin.
Omit `message_id` to remove the most recent pinned message.
Show the preview to the user.
Call the same tool with `confirm=true` only after the user agrees.
The bot needs Telegram's required pin permissions.
See [pinChatMessage](https://core.telegram.org/bots/api#pinchatmessage) and [unpinChatMessage](https://core.telegram.org/bots/api#unpinchatmessage).
These actions do not change local message storage.

### Command menu

Call `get_commands` to read the bot's command menu.
Call `set_commands` with a `commands` array to get a preview.
Each entry has `command` and `description` fields.
Use at most 100 commands.
Use 1-32 characters for each command.
Use lowercase Latin letters, digits, or underscores without the leading `/`.
Use a nonempty description.
See [setMyCommands](https://core.telegram.org/bots/api#setmycommands) and [Commands](https://core.telegram.org/bots/features#commands).
Show the preview to the user.
Call `set_commands` with `confirm=true` only after the user agrees.
Use an empty array to clear the default command menu.
These tools use the default scope and language.
They do not change local message storage.

### Rate limits

Remind the user of these limits before bursts or bulk sends:

- In one chat, avoid more than 1 message per second. Short bursts can be allowed, but Telegram eventually returns 429.
- In one group, send no more than 20 messages per minute.
- For bulk notifications, send no more than about 30 messages per second, unless paid broadcasts are used.

See the [Telegram rate limits FAQ](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).
On 429, stop sending.
Wait `parameters.retry_after` seconds before sending again.
See [ResponseParameters](https://core.telegram.org/bots/api#responseparameters).
The plugin does not throttle sends.
It reminds the user of the limits.
Bots that share one token share these limits.

### Webhook and getUpdates

`getUpdates` does not work when a webhook is set.
See the [getUpdates reference](https://core.telegram.org/bots/api#getupdates).
Telegram returns 409 Conflict when a webhook is set or another process polls the same token.
Call `get_webhook_info` to check the webhook.
Call `delete_webhook` to get a preview.
Show the preview to the user.
Call `delete_webhook` with `confirm=true` after the user agrees.
Set `drop_pending_updates=true` only to discard pending updates.
After deletion, the bot can use `getUpdates`.

### Message storage time

Telegram keeps incoming updates until the bot receives them.
It keeps them for no more than 24 hours.
See [Getting updates](https://core.telegram.org/bots/api#getting-updates).
If the plugin is stopped or background fetch is off for 24 hours, older updates can be lost.

### Group messages and privacy mode

Privacy mode is on by default.
With privacy mode on, the bot sees only these messages in groups:

- Commands meant for it.
- General commands if it was the last bot to send a message in the group.
- Inline messages sent via the bot.
- Replies to messages meant for it, either implicitly or explicitly.

All bots receive service messages and all private-chat messages.
All bots receive all messages in channels where they are members.
Bots added to a group as admins receive all messages.
Turning off privacy mode is required during setup.
Send `/setprivacy` to BotFather. Select the bot and choose **Disable**.
Re-add the bot to the group for this change to take effect.
See the official [Privacy Mode page](https://core.telegram.org/bots/features#privacy-mode).

### Local storage

The plugin uses `sql.js` with its bundled WASM file.
The startup script installs the dependency when it is missing.
Users do not compile native code or install SQLite.
Each bot uses `~/.telegram-bot-cursor-plugin/<bot ID>/store.sqlite`.
The bot directory uses mode `0700`. The database uses mode `0600`.
Filter config stays in `filters.json` with mode `0600`.

The tables are `meta`, `chats`, and `messages`.
Queries do not use JOINs.
`meta` saves `offset`, `business`, `last_update_at`, and `last_poll_at`.
`messages.summarized_at IS NULL` means the message has not yet been summarized.
A local page read sets `summarized_at` to the current Unix time.
Owner business messages and tool send results start as summarized.
`pending_order` preserves page order across chats.
An edit keeps its place if the message is still unsummarized.
An edit to a summarized incoming message makes it available again.
`get_chat_messages` reads context without changing these fields.
`my_chat_member` updates save bot joins and leaves without adding messages.

The store keeps the last 2000 messages per chat and any older unsummarized messages.
It saves filtered messages too. It stores short fields only.
For media it stores `file_id` and related metadata.
It does not download photo or file bytes during background fetch.
Use `download_file` when a local copy is needed.
It does not store a token.
The poller omits a stale or unknown offset after 6 idle days.
`last_update_at` changes only after a nonempty batch.
`last_poll_at` records each successful fetch.
`poll.lock` serializes polls and local store changes.
A database save uses a temporary file and then renames it.
To clear saved data, delete the bot directory.
If a crash leaves `poll.lock`, delete it when no process uses that bot.

On first open, an empty or missing database imports `store.json`.
The import includes chats, messages, pending entries, offset, and business state.
The old file becomes `store.json.migrated`.
If import fails, the plugin logs the error and uses empty SQLite.
The old file is archived. The plugin stops writing live message data to JSON.

### Advanced: background fetch settings

Most people can ignore this section.
Background fetch is on by default.
It checks about every 2 minutes.
Configure exposes optional settings through `mcp.json` and the plugin variables.
Environment settings also work when you run the server directly.
Restart the plugin after a change.

| Variable | Meaning |
| --- | --- |
| `TELEGRAM_POLL_ENABLED` | Default: on. Empty, `1`, `true`, and `yes` mean on. `0`, `false`, `no`, and `off` mean off. Letter case does not matter. |
| `TELEGRAM_POLL_INTERVAL_SEC` | Default: 120 seconds (2 minutes). Values are limited to 30–600 seconds. Empty or invalid values use 120. |

在插件 Configure 中，可以关闭自动获取或改间隔。
Set **Background fetch** to `off` and restart the plugin.
关闭后，插件不会自动从 Telegram 获取新消息。
`read_new_messages` 只显示已经保存、但还没有总结的消息。
要再次获取 Telegram 新消息，请重新打开后台获取。
Clear the setting or set it to `on`, then restart the plugin.
To change the wait, set **Fetch interval in seconds** to 30–600.
Leave it blank to use 120 seconds (2 minutes).
Restart the plugin after a change.

Tests use `createServer({ pollEnabled: false })` to disable the timer.
They use `server.pollOnce(botId)` to fetch one cycle.
Omit `botId` to test all configured bots.

### Telegram Business

`getUpdates` requests these additional update types:
`business_connection`, `business_message`, `edited_business_message`, and `deleted_business_messages`.
Connections are saved in `store.business` by connection ID.
The saved fields are `user_id`, `user_name`, `user_username`, `user_chat_id`, `can_reply`, `is_enabled`, and `date`.
`user_username` stores the owner username when Telegram supplies it.
Business owner mentions use `user_username`; configured `owner_names` also count.
Replies to the owner use `user_id`. Refresh older saved connections to store the username.
Unknown connections get an empty entry.

Business chats use `<business_connection_id>:<chat id>` as the store key.
Messages and chat entries save `business_connection_id`.
`list_chats` returns `chat_key` for all chats.
For business chats, `id` also contains this key.
Use the key for saved history, chat filter rules, and send tools.
Compact lines show `[business private]` and the key.

Messages from the owner or `sender_business_bot` are saved with `outgoing: true`.
`read_new_messages` excludes them in both modes.
`get_chat_messages` shows them with `(you)` after the sender.
Deleted business messages are removed from the store.
The plugin never calls `readBusinessMessage`.

The send helper splits a business chat key when its connection is known.
It sends `business_connection_id` and the numeric `chat_id` to Telegram.
The preview uses the store key to find the chat.
Confirmation is still required.
Returned business messages are saved as outgoing.
Telegram rejects methods that do not support this parameter.

`get_me` refreshes each known connection with `getBusinessConnection` under the store lock.
It returns business settings, connection status, reply permission, and plain Chinese `missing_steps` and `next_step`.
`next_step` is the first missing step: Secretary Mode, privacy mode off, connect the bot, then allow replies if needed.
When no step is missing, it says 「设置已完成。可以把机器人加进需要的群，然后让我读新消息，或每天给你总结和待办。」.
`list_bots` reads bot settings with `getMe` and uses saved connection state for these steps.
It does not call `getBusinessConnection`.
See [BusinessConnection](https://core.telegram.org/bots/api#businessconnection) and [getBusinessConnection](https://core.telegram.org/bots/api#getbusinessconnection).

### Tests

Use Node.js 20 or later.
The tests use mock requests.
They do not call Telegram.

```sh
cd server && npm install && npm test
```
