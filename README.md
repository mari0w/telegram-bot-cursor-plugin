# Telegram Bot

This Cursor plugin uses the Telegram Bot API through an MCP server.
It lists bots, checks bot details, receives messages, and manages webhooks.
It uses Bot API only.
It does not use MTProto or a user login.
Sending tools will come in later versions.

## Create a bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot`.
3. Set a name.
4. Set a username.
5. Get the token from BotFather.

See the [BotFather guide](https://core.telegram.org/bots/features#botfather).

## Configure tokens

Set tokens in plugin Configure or in the MCP environment.
Bot 1 (`TELEGRAM_BOT_TOKEN`) is required and is the default bot.
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

## Tools in 0.2.0

| Tool | Use |
| --- | --- |
| `list_bots` | List bot numbers, IDs, names, default status, and API status. |
| `get_me` | Get the selected bot's name, ID, and bot settings. |
| `read_new_messages` | Read new messages once and save them. Set `timeout` to 0–50 seconds. |
| `list_chats` | List saved chats, with the newest chat first. |
| `get_chat_messages` | Read recent saved messages for one chat. Use `limit` and `before_message_id` to select messages. |
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
It saves `last_update_at` in Unix seconds and omits the offset after 7 days without updates.
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
