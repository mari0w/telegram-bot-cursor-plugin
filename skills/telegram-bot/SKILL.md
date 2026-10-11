---
name: telegram-bot
description: Use the Telegram Bot API to manage bots, messages, files, chat details, pins, command menus, and webhooks in Cursor.
---

# Telegram Bot

Use the tools in version 1.0.0.

1. Call `list_bots` first.
2. Pass `bot` with a username or numeric bot ID to select a bot.
3. Omit `bot` to use the default bot from `TELEGRAM_BOT_TOKEN`.
4. Call `read_new_messages` to receive and save new messages.
5. Call `list_chats` to find saved chats.
6. Call `get_chat_messages` to read saved messages for one chat.
7. Call `get_me` to check the selected bot's details when needed.
8. Never paste a bot token into chat.
9. Ask the user to change the token in plugin Configure only for a 401 Unauthorized error.

`read_new_messages` runs once per call.
It does not poll in the background.
If `more` is true, call it again to read more updates.
Tell the user that Telegram keeps incoming updates for no more than 24 hours.
Messages older than 24 hours on the server are lost if nobody reads them.

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
The bot sends as itself.
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
Use a file ID from `read_new_messages` or `get_chat_messages`.
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
Use BotFather's `/setprivacy` to change privacy mode.
Re-add the bot to the group after this change.
See [Privacy Mode](https://core.telegram.org/bots/features#privacy-mode).
