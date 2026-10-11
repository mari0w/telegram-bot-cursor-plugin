---
name: telegram-bot
description: Use the Telegram Bot API to list configured bots and check bot details in Cursor.
---

# Telegram Bot

1. Call `list_bots` first.
2. Pass `bot` with a username or numeric bot ID to select a bot.
3. Omit `bot` to use the default bot from `TELEGRAM_BOT_TOKEN`.
4. Call `get_me` to check the selected bot's details.
5. Never paste a bot token into chat.
6. Ask the user to change the token in plugin Configure only for a 401 Unauthorized error. For other errors, follow the error message.

Sending tools will come in later versions.
