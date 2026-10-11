---
name: telegram-bot
description: Use the Telegram Bot API to list bots, receive, send, edit, delete, and forward messages, read saved chats, and manage webhooks in Cursor.
---

# Telegram Bot

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

On a 409 Conflict error, call `get_webhook_info` to check the webhook.
To remove it, call `delete_webhook` without confirmation to get a preview.
Show the preview to the user.
Call `delete_webhook` with `confirm=true` only after the user agrees.
On a lock error, wait and retry later.
For other errors, follow the error message.

## Send messages

1. Read the chat with `get_chat_messages`.
2. Call `send_message`, `edit_message`, `delete_message`, or `forward_message` without `confirm` to get a preview.
3. Show the preview to the user.
4. Call the same tool with `confirm=true` only after the user agrees.

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
If the result has `store_error`, do not repeat the Telegram action.
Telegram can delete only messages sent less than 48 hours ago.
See [deleteMessage](https://core.telegram.org/bots/api#deletemessage).
The bot cannot message users who have never contacted it.
The user must first send it a message or add it to a group.
See [Telegram bots](https://core.telegram.org/bots).

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
Photo and file sending will come in a later version.
