# Telegram Bot

This Cursor plugin uses the Telegram Bot API through an MCP server.
It lists bots and checks bot details.
It uses Bot API only.
It does not use MTProto or a user login.
Other tools will come in later versions.

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

## Tools in 0.1.0

| Tool | Use |
| --- | --- |
| `list_bots` | List bot numbers, IDs, names, default status, and API status. |
| `get_me` | Get the selected bot's name, ID, and bot settings. |

## Tests

Use Node.js 20 or later.
The tests use mock requests.
They do not call Telegram.

```sh
cd server && npm install && npm test
```
