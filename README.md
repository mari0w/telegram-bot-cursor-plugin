# Telegram Bot

Version 1.0.0 uses the Telegram Bot API through an MCP server in Cursor.
It receives, sends, edits, deletes, and forwards messages.
It sends and downloads files.
It reads chat details and administrators.
It manages pins, command menus, and webhooks.
It uses Bot API only.
It does not use MTProto or a user login.

## Create a bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot`.
3. Set a name.
4. Set a username.
5. Get the token from BotFather.

See the [BotFather guide](https://core.telegram.org/bots/features#botfather).

## Configure tokens

Set tokens in plugin Configure or in the MCP environment.
`TELEGRAM_BOT_TOKEN` sets bot 1 as the default bot.
Extra bots use `TELEGRAM_BOT_TOKEN_2` through `TELEGRAM_BOT_TOKEN_5`.
You can set up to five bots.
Gaps are allowed.
Blank values and whole `${...}` values count as unset.
Calls that omit `bot` need `TELEGRAM_BOT_TOKEN`.

## Select a bot

Call `list_bots` first.
Set `bot` to a username, with or without `@`, or a numeric bot ID.
Username matching ignores case.
Omit `bot` to use bot 1.
An unknown bot returns an error.
The server does not switch to the default bot after this error.

## Proxy

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

## Security

A token gives full control of the bot.
Do not commit a token.
Do not paste a token into chat.
The server removes tokens from errors and error logs.
The tools do not return tokens.

## Tools in 1.0.0

| Tool | Use |
| --- | --- |
| `list_bots` | List bot numbers, IDs, names, default status, and API status. |
| `get_me` | Get the selected bot's name, ID, and bot settings. |
| `read_new_messages` | Read new messages once and save them. Set `timeout` to 0–50 seconds. |
| `list_chats` | List saved chats, with the newest chat first. |
| `get_chat_messages` | Read recent saved messages for one chat. Use `limit` and `before_message_id` to select messages. |
| `send_message` | Preview and send text as the bot. |
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

## Receive messages

Call `read_new_messages` to receive messages.
It runs `getUpdates` only when you call it.
The server does not poll in the background.
It stores messages, edited messages, channel posts, and edited channel posts.
It acknowledges other update types and does not store them.
If `more` is true, call it again to read more updates.
Call `list_chats` to find saved chats.
Call `get_chat_messages` to read messages for one chat.

## Send messages

Read the chat with `get_chat_messages` first.
Call the send, edit, delete, or forward tool without `confirm` to get a preview.
Show the preview to the user.
Call the same tool with `confirm=true` only after the user agrees.
The bot sends as itself.
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

### The bot cannot start a chat

The bot cannot start a chat with a user.
The user must send it a message first or add it to a group.
See [Telegram bots](https://core.telegram.org/bots).

## Send files

Use `send_photo` for photos.
Use `send_document` for other files.
Set `file` to an existing local file path, an HTTP(S) URL, or a Telegram `file_id`.
Use a file ID from a message returned by `read_new_messages` or `get_chat_messages`.
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

## Download files

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

## Chat info and pinning

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

## Command menu

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

## Rate limits

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

## Webhook and getUpdates

`getUpdates` does not work when a webhook is set.
See the [getUpdates reference](https://core.telegram.org/bots/api#getupdates).
Telegram returns 409 Conflict when a webhook is set or another process polls the same token.
Call `get_webhook_info` to check the webhook.
Call `delete_webhook` to get a preview.
Show the preview to the user.
Call `delete_webhook` with `confirm=true` after the user agrees.
Set `drop_pending_updates=true` only to discard pending updates.
After deletion, the bot can use `getUpdates`.

## Message storage time

Telegram keeps incoming updates until the bot receives them.
It keeps them for no more than 24 hours.
See [Getting updates](https://core.telegram.org/bots/api#getting-updates).
If you do not call `read_new_messages` within 24 hours, you lose those messages.

## Group messages and privacy mode

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

## Local storage

The server saves messages in `~/.telegram-bot-cursor-plugin/<bot ID>/store.json`.
It creates the bot directory with mode `0700` and the file with mode `0600`.
It keeps the last 200 messages per chat.
It stores short fields only.
It does not store a token.
It saves the offset in the same file as the messages.
It saves the fetch time as `last_update_at` in Unix seconds and omits the offset after 6 days because Telegram can hold updates for 24 hours.
`poll.lock` prevents two processes from polling one bot at the same time.
To clear saved data, delete the bot directory.
If a crash leaves a stale `poll.lock`, delete it when no other process reads messages for that bot.

## Tests

Use Node.js 20 or later.
The tests use mock requests.
They do not call Telegram.

```sh
cd server && npm install && npm test
```
