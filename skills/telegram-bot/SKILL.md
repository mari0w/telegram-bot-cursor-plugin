---
name: telegram-bot
description: Use the Telegram Bot API to list bots, receive messages, read saved chats, and manage webhooks in Cursor.
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

Sending tools will come in later versions.
