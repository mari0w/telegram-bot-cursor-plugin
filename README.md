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
3. Send `/setprivacy` to BotFather. Select your bot. Choose **Disable**.
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
The plugin checks for new messages when you ask.
It does not check in the background.
Ask again if more messages are waiting.

You see private messages by default.
You also see messages that mention your bot or your connected account.
You see replies to your bot or your connected account.
For other group messages, you see the new message count.
You also see the time of the last message.
Channels use the same display rules as groups.

群通知和贴纸默认收起。
条数会显示为「已收起 N 条。」。
File messages show the file type.
Messages that were edited have a mark.
Long messages are shortened on screen.

Ask the AI to list saved chats.
Then ask it to show messages from a chat.
It shows saved messages from that chat in full.
被规则收起的消息仍会保存。你可以随时要求查看。

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
也可以说：“显示所有新消息，包括被收起的消息。”
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
Read new messages at least once a day to avoid losing them.
The plugin keeps the last 200 saved messages from each chat.

Telegram limits which group messages a bot can receive by default.
It receives commands meant for it and replies meant for it.
It also receives group notices.
Ask the AI for help if you need it to receive other group messages.
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

Version 1.1.0 uses the Telegram Bot API through an MCP server in Cursor.
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

### Tools in 1.1.0

| Tool | Use |
| --- | --- |
| `list_bots` | List bots, settings, API status, missing setup steps, and the next step. |
| `get_me` | Get bot settings and refresh known business connections. Return missing setup steps and the next step. |
| `read_new_messages` | Read and save new messages. Return compact text with message filters. Set `timeout` to 0–50 seconds. Set `all=true` to show all messages. |
| `list_chats` | List saved chats, with the newest chat first. |
| `get_chat_messages` | Read saved messages for one chat as compact text. Use `limit` and `before_message_id` to select messages. Set `show_filtered=true` to show filtered messages. |
| `get_filters` | Read the bot's message filter config for the AI. Explain rules to the owner in everyday language. |
| `set_filters` | Preview rule changes in plain Chinese. Save only with `confirm=true` after the owner clearly agrees. |
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

The request timeout for most API calls and file downloads is 15 seconds.
For `read_new_messages`, the request timeout is `timeout + 10` seconds.
The `timeout` parameter is an integer from 0 to 50 seconds.
It defaults to 0.
Each `getUpdates` call requests at most 100 updates.


Call `read_new_messages` to receive messages.
It runs `getUpdates` only when you call it.
The server does not poll in the background.
It stores messages, edited messages, channel posts, and edited channel posts.
It also stores business connections and business messages.
Business deletion updates remove saved messages.
It acknowledges other update types and does not store them.
If the result says that more updates are waiting, call it again.
Call `list_chats` to find saved chats.
Call `get_chat_messages` to read messages for one chat.

### Message filter

`read_new_messages` returns compact text.
It shows private messages in full by default.
It also shows bot and owner `@mentions`, and replies to the bot or owner, in full.
Private chats, including business private chats, and these mentions and replies are messages for the owner.
The owner is the user of a known business connection.
Allowed chats, allowed users, and include matches also show messages in full.
Other group, supergroup, and channel messages use one summary line per chat.
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

Set `all=true` on `read_new_messages` to show every incoming new message as a full line.
This includes filtered messages.
The result has no group summary or filtered count.
The 500-character limit still applies.
`get_chat_messages` shows full lines for the selected chat, including muted chats.
It hides filtered messages by default.
Set `show_filtered=true` to view filtered messages.

The server saves each bot's config in `~/.telegram-bot-cursor-plugin/<bot ID>/filters.json`.
It creates the bot directory with mode `0700` and the config file with mode `0600`.
A missing config file uses empty arrays except for `protected_words`.
A missing file or missing `protected_words` field uses `["投诉", "退款", "急"]`.
Set `protected_words: []` to remove this protection.
All filtering uses local fixed rules. It does not use AI judgment or an external service.

| Field | Use |
| --- | --- |
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

All config fields are arrays.
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
4. Show messages for the owner, allowed chats, allowed users, and include matches in full.
5. Show other messages in a group summary.

To change rules:

1. Read real saved messages with `get_chat_messages`.
2. Call `get_filters` for the bot.
3. Call `set_filters` with the changed fields to get a preview.
4. Show the preview as is. Point out messages that might be hidden by mistake.
5. Wait for the owner to clearly agree.
6. Call `set_filters` with the same fields and `confirm=true`.

Given fields replace the saved arrays.
Omitted fields keep their saved values.
Use an empty array to clear a field.
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
Known chats use their saved names.
Users use the given username or a saved sender name for a matching ID.
Unknown chats and users use their IDs.
The preview classifies all locally saved messages with both sets of rules.
It uses the bot ID and username, and known owner IDs and usernames, as both message read tools do.
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
Use a file ID from the bot's `store.json`.
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
If you do not call `read_new_messages` within 24 hours, you lose those messages.

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
To turn privacy mode off, send `/setprivacy` to BotFather.
Re-add the bot to the group for this change to take effect.
See the official [Privacy Mode page](https://core.telegram.org/bots/features#privacy-mode).

### Local storage

The server saves messages in `~/.telegram-bot-cursor-plugin/<bot ID>/store.json`.
It saves message filter config in the same bot directory as `filters.json`.
It creates the bot directory with mode `0700` and both files with mode `0600`.
It keeps the last 200 messages per chat.
It saves filtered messages too.
It stores short fields only.
It does not store a token.
It saves the offset in the same file as the messages.
It saves the fetch time as `last_update_at` in Unix seconds and omits the offset after 6 days because Telegram can hold updates for 24 hours.
`poll.lock` prevents two processes from polling one bot at the same time.
To clear saved data, delete the bot directory.
If a crash leaves a stale `poll.lock`, delete it when no other process reads messages for that bot.

### Telegram Business

`getUpdates` requests these additional update types:
`business_connection`, `business_message`, `edited_business_message`, and `deleted_business_messages`.
Connections are saved in `store.business` by connection ID.
The saved fields are `user_id`, `user_name`, `user_username`, `user_chat_id`, `can_reply`, `is_enabled`, and `date`.
`user_username` stores the owner username when Telegram supplies it.
Older saved connections use `user_name` until they are refreshed.
Unknown connections get an empty entry.

Business chats use `<business_connection_id>:<chat id>` as the store key.
Messages and chat entries save `business_connection_id`.
`list_chats` returns `chat_key` for all chats.
For business chats, `id` also contains this key.
Use the key for saved history, chat filter rules, and send tools.
Compact lines show `[business private]` and the key.

Messages from the owner or `sender_business_bot` are saved with `outgoing: true`.
`read_new_messages` excludes them, also with `all=true`.
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
