---
name: telegram-bot
description: Use the Telegram Bot API to manage bots, messages, files, chat details, pins, command menus, and webhooks in Cursor.
---

# Telegram Bot

Use the tools in version 1.1.0.

1. Call `list_bots` first.
2. Pass `bot` with a username or numeric bot ID to select a bot.
3. Omit `bot` to use the default bot from `TELEGRAM_BOT_TOKEN`.
4. Call `read_new_messages` to receive and save new messages.
5. Call `list_chats` to find saved chats.
6. Call `get_chat_messages` to read saved messages for one chat.
7. Call `get_me` to check the selected bot's details when needed.
8. Never paste a bot token into chat.
9. Ask the user to change the token in plugin Configure only for a 401 Unauthorized error.

`read_new_messages` fetches batches of 100 updates, with at most 20 requests per call.
Only the first request uses `timeout`. Later requests use 0.
It saves each batch before the next request.
It shows the next page of saved incoming messages, even if no new updates arrive.
Set `limit` from 1 to 1000. The default is 200 messages per page.
Current modes and filters apply to each page.
If the result says that more updates are waiting, call it again.
If it says 「还有 N 条没显示」, call it again for the next page or use the remaining counts to select a group.
It does not poll in the background.
Tell the user to let the AI fetch new messages at least once every 24 hours.
Telegram drops updates older than 24 hours.
The local store keeps the last 2000 messages per chat.

## Setup guide

Call `get_me` or `list_bots` to check `next_step`.
The done text is 「设置已完成。可以把机器人加进需要的群，然后让我读新消息，或每天给你总结和待办。」.
If `next_step` is not the done text, lead the owner one step at a time.
Tell only the next step in plain words: which chat to open, which command to send, and which button to tap.
Do not use technical words with the owner.
Wait until the owner says the step is done.
Call `get_me` or `list_bots` again to check before the next step.
Turning off privacy mode is required during setup.
Tell the owner to send `/setprivacy` to BotFather, select the bot, and tap **Disable**.
After privacy mode is off, tell the owner to remove the bot from old groups and add it again.
After the owner connects the bot, call `read_new_messages` once to receive the connection.
Then call `get_me` again to check it.
Telegram Premium is not needed for business bots.
Bot API 10.0 removed this requirement. See the [Bot API changelog](https://core.telegram.org/bots/api-changelog).

## Daily summary

1. Call `read_new_messages` until there is no 「还有 N 条没显示」. Also repeat if more updates are waiting. If you stop early, note the remaining counts for each group.
2. Check the message count for each group.
3. Read important groups in batches with `get_chat_messages`. Use `limit` and `before_message_id` to read earlier batches.
4. Write the summary and the to-do list.

Remind the user to let the AI fetch new messages at least once every 24 hours.
Telegram drops updates older than 24 hours.

## Telegram Business

Use the business chat key from the result for history and send tools.
Sending in a business chat sends as the owner.
Show the preview to the owner.
Set `confirm=true` only after the owner agrees.
The bot can reply only in private chats with incoming messages in the last 24 hours.
See [BusinessBotRights](https://core.telegram.org/bots/api#businessbotrights).
Owner messages are context only in saved history.
Never mark messages as read.

## Message filter

All message filtering runs locally.
It uses fixed rules, with no AI judgment or external service.
The owner must approve every addition, change, or deletion of a rule.
Always show the `set_filters` preview text to the owner as is first.
Point out the messages that might be hidden by mistake.
Save with `confirm=true` only after the owner clearly agrees.
Never add rules by yourself.
Use everyday language with the owner. Call messages that are put away 「收起」.
Do not reveal regex, JSON, chat IDs, or file paths.
The `get_filters` result is for the AI.

Read the owner's real saved messages with `get_chat_messages` before you choose a rule.
Use `show_filtered=true` when you need to inspect messages that are already 收起.
Make the rule as specific as possible.
Do not use a single common word.
Prefer several words that must all appear, or limit the rule to one group or one person.
Protected words and messages for the owner are kept by default.
If the owner says a message was hidden by mistake, propose a rule change with `set_filters`.
Show the preview and point out possible mistakes.
Confirm only after the owner agrees.

`read_new_messages` returns compact text.
The initial default mode is `all`.
It shows all readable incoming messages in full, including private chats, business private chats, and all groups.
Set `mode="for_me"` for one call to use the rules below.
Private chats, including business private chats, are messages for the owner.
An `@mention` means an `@mention` of the owner.
Match text that contains `@` plus a name in `owner_names`, or the username of a known business connection owner. Ignore case.
Owner names can have an `@` prefix. Plain names also match when text contains `@` plus the name.
Find replies to the owner by the owner's user ID from a known business connection, not by a name.
Mentions of the bot and replies to the bot also count.
In `for_me` mode, these messages show in full.
Allowed chats, allowed users, and include matches also show in full.
In `for_me` mode, other group, supergroup, and channel messages use one summary line per chat.
In both modes, muted chats show a summary line only, including messages for the owner.
Messages that are 收起 are saved too.
The count says 「已收起 N 条。」.
Omit `mode` to use the saved `default_mode`.
Use `set_filters` with `default_mode="for_me"` to make this the default, or `default_mode="all"` to restore full text.
Show the preview and save with `confirm=true` only after the owner agrees.
When the owner turns on `for_me` and `owner_names` is empty, ask for their Telegram username in plain words.
Tell them to open Telegram Settings and find the username under their name.
If a business connection has a username, offer it as the suggestion and ask the owner to confirm it.
Call `get_filters` and keep existing names when you prepare `owner_names`.
Use `set_filters` to preview the names. Show the preview and save with `confirm=true` only after the owner agrees.
An empty `owner_names` adds a final `AI:` hint to each `for_me` read, even when there are no new messages.
Follow this hint. It includes a suggested username only when a business connection has one.
Use `get_chat_messages` with `show_filtered=true` to view saved messages that are 收起.
Text longer than 500 characters is cut to 500 characters plus `…`.

When an `@mention` of the owner or a reply to the owner is unclear, call `get_chat_messages` with `chat_id` and `message_id`.
Read the original message and the context yourself before asking the user.
The tool shows the saved original reply message first with 「原消息：」.
If it has a reply ID but the original is not saved, it says 「原消息没有保存在本地。」.
It then shows nearby messages, oldest first, with 「→ 」 before the selected message.
Set `context` from 0 to 50 for the number of messages on each side. The default is 5.
The tool uses local messages from the same chat and ignores `limit` and `before_message_id` when `message_id` is set.
Hiding rules still apply unless `show_filtered=true`.

The config is `~/.telegram-bot-cursor-plugin/<bot ID>/filters.json`.
The config file uses mode `0600`. The bot directory uses mode `0700`.
`default_mode` is `"all"` or `"for_me"`. A missing file or field uses `"all"`.
All other fields are arrays. They are empty by default except `protected_words`.
A missing file or missing `protected_words` field uses `["投诉", "退款", "急"]`.
An explicit empty array removes these protected words.

- `allow_chats` shows messages from these chat IDs in full.
- `mute_chats` shows only a summary line for these chat IDs.
- `exclude_keywords` puts away text that contains any listed word.
- `include_keywords` shows text that contains any listed word in full.
- `exclude_regex` puts away text that matches any JavaScript RegExp source with flag `i`.
- `include_regex` shows matching text in full with flag `i`.
- `allow_users` shows messages from these sender IDs or usernames in full.
- `block_users` puts away messages from these sender IDs or usernames.
- `exclude_rules` contains objects with optional `words`, `pattern`, `chats`, `users`, and `include_for_me`.
- `protected_words` keeps text with any listed word from all exclude rules.
- `owner_names` contains the owner's usernames, with or without `@`, or names. Default: `[]`.

Each `exclude_rules` item requires all given conditions to match.
All `words` must appear. `pattern` uses JavaScript RegExp with flag `i`.
`chats` limits the rule to listed chats. `users` limits it to listed senders.
Only an item with `include_for_me: true` can put away messages for the owner.
Simple keyword and regex exclusions never put away messages for the owner.
Protected words also stop an `include_for_me` exclusion.
Chat IDs compare as strings. Use business chat keys for business chats.
Usernames can have an `@` prefix. Username and word matching ignore case.
Words match substrings of text, including captions.
Patterns are checked before a rule is saved.

Apply rules in this order:

1. Put away messages from blocked users, service messages, and stickers.
2. Apply exclude rules, subject to protected words and messages for the owner.
3. Show muted chats as summaries.
4. In `all` mode, show all remaining messages in full.
5. In `for_me` mode, show messages for the owner, allowed chats, allowed users, and include matches in full. Show other messages in a group summary.

To change rules:

1. Read real saved messages with `get_chat_messages`.
2. Call `get_filters` for the bot.
3. Call `set_filters` with changed fields to get a preview.
4. Show the preview as is. Point out messages that might be hidden by mistake.
5. Wait for the owner to clearly agree.
6. Call `set_filters` with the same fields and `confirm=true`.

Given fields replace saved values. Omitted fields keep saved values.
Pass the full new list, including existing items.
The preview compares all saved messages with current and proposed rules.
It says 「按现在已保存的消息算，会多收起 N 条。」 and gives up to three examples.
A separate 「可能误收的消息（请看一下）：」 block gives up to three new matches
that have more than 100 characters, contain `?` or `？`, or come from private chats.
The preview does not save the rule.
For `default_mode="for_me"`, it says 「以后默认只完整显示给你的消息（私聊、@你、回复你），其他群消息只显示条数。」.
For `default_mode="all"`, it says 「以后默认显示所有消息的全文。」.
When the default changes to `for_me` and `owner_names` stays empty, the preview also gives the username hint.
It tells the owner 「还没有设置你的 Telegram 用户名，@你 的消息可能认不出来。」.
For added owner names, it says 「以后把『…』当作你的名字：别人 @ 这些名字的消息算给你的。」.
For removed owner names, it says 「『…』不再当作你的名字。」.

## Changes need agreement

Use this flow for every tool that changes Telegram data:

1. Call the tool without `confirm` to get a preview.
2. Show the preview to the user.
3. Wait for the user to agree.
4. Call the same tool with `confirm=true`.

This flow applies to these tools:

- `send_message`
- `edit_message`
- `delete_message`
- `forward_message`
- `send_photo`
- `send_document`
- `pin_message`
- `unpin_message`
- `set_commands`
- `delete_webhook`

If the result has `store_error`, the Telegram action succeeded.
Do not repeat the action to fix a local save error.
On a lock error, wait.
Retry later.
For other errors, follow the error message.

## Send messages

Read the chat with `get_chat_messages` first.
Use `send_message` to send text.
Use `edit_message` to change message text.
Use `delete_message` to remove a message.
Use `forward_message` to send a message to a target chat.
Use the preview and agreement flow for each action.
The bot sends as itself in normal bot chats.
It sends as the owner in business chats.
Others in the chat can see the message.
Set `parse_mode` to `HTML` or `MarkdownV2` for send or edit.
Omit it for plain text.
Legacy `Markdown` is not offered.
Set `reply_to_message_id` to reply to a message.
Text must be 1-4096 characters after entity parsing.
See [sendMessage](https://core.telegram.org/bots/api#sendmessage).
Sent, edited, and forwarded messages are saved locally.
Deleted messages are removed from local storage.
Telegram can delete only messages sent less than 48 hours ago.
See [deleteMessage](https://core.telegram.org/bots/api#deletemessage).
The bot cannot message users who have never contacted it.
The user must first send it a message or add it to a group.
See [Telegram bots](https://core.telegram.org/bots).

## Send and download files

Use `send_photo` for photos.
Use `send_document` for other files.
Set `file` to an existing local file path, an HTTP(S) URL, or a Telegram `file_id`.
Use a file ID from the bot's `store.json`.
Use the same bot that received the file ID.
Use the preview and agreement flow before sending.
The preview shows the source and local file size.
The plugin checks local file size in the preview and before sending.

Telegram sets these size limits:
See [Sending files](https://core.telegram.org/bots/api#sending-files).

| Source | Photo | Other files |
| --- | --- | --- |
| Local upload | 10 MB | 50 MB |
| HTTP(S) URL | 5 MB | 20 MB |

The plugin does not check URL file size.
Telegram supports document URLs for PDF and ZIP files.
See [Sending files](https://core.telegram.org/bots/api#sending-files).
Captions must have 0-1024 characters after entity parsing.
See [sendPhoto](https://core.telegram.org/bots/api#sendphoto) and [sendDocument](https://core.telegram.org/bots/api#senddocument).
Set `parse_mode` to `HTML` or `MarkdownV2` to format the caption.
Set `reply_to_message_id` to reply to a message.
Set `disable_notification=true` to send without a notification sound.
Sent file messages are saved locally.

Call `download_file` with `file_id` to save a file locally.
This tool does not need `confirm`.
Telegram allows bot downloads up to 20 MB.
See [getFile](https://core.telegram.org/bots/api#getfile).
The tool returns a local path, file size, and Telegram file path.
It does not return a token or download URL.
Downloads are saved under `~/.telegram-bot-cursor-plugin/<bot ID>/files/`.
To clear downloads, delete the bot's `files` directory.

## Chat info and pins

Call `get_chat` with `chat_id` to read current chat details.
Call `get_chat_admins` with `chat_id` to read the administrators.
These tools do not need `confirm`.
Call `pin_message` with `chat_id` and `message_id` to preview a pin.
Set `disable_notification=true` to pin without a notification.
Call `unpin_message` to preview removal of a pin.
Omit `message_id` to remove the most recent pinned message.
Use the preview and agreement flow for both changing tools.
The bot needs Telegram's required pin permissions.
See [pinChatMessage](https://core.telegram.org/bots/api#pinchatmessage) and [unpinChatMessage](https://core.telegram.org/bots/api#unpinchatmessage).

## Command menu

Call `get_commands` to read the command menu.
Call `set_commands` with an array of `command` and `description` entries.
Use at most 100 commands.
Use 1-32 characters for each command.
Use lowercase Latin letters, digits, or underscores without the leading `/`.
Use a nonempty description.
See [setMyCommands](https://core.telegram.org/bots/api#setmycommands) and [Commands](https://core.telegram.org/bots/features#commands).
Use the preview and agreement flow to set the menu.
Use an empty array to clear the default menu.
These tools use the default scope and language.

## Rate limits

Remind the user of these limits before bursts or bulk sends:

- In one chat, avoid more than 1 message per second. Short bursts can be allowed, but Telegram eventually returns 429.
- In one group, send no more than 20 messages per minute.
- For bulk notifications, send no more than about 30 messages per second, unless paid broadcasts are used.

See the [Telegram rate limits FAQ](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).
On 429, stop sending.
Wait `retry_after` seconds before sending again.
See [ResponseParameters](https://core.telegram.org/bots/api#responseparameters).
The plugin reminds the user of these limits.
It does not throttle sends.
Bots that share one token share these limits.

## Webhook and getUpdates

`getUpdates` does not work while a webhook is set.
See [getUpdates](https://core.telegram.org/bots/api#getupdates).
On 409 Conflict, call `get_webhook_info` to check the webhook.
Another process can also cause 409 if it polls the same token.
Use the preview and agreement flow for `delete_webhook` to remove a webhook.
Set `drop_pending_updates=true` only to discard pending updates.
Call `read_new_messages` after removal to use `getUpdates`.

## Privacy mode

Privacy mode is on by default.
It limits the group messages that the bot can read.
Bots with admin rights receive all group messages.
Turning off privacy mode is required.
Send `/setprivacy` to BotFather. Select the bot and tap **Disable**.
Re-add the bot to the group after this change.
See [Privacy Mode](https://core.telegram.org/bots/features#privacy-mode).
