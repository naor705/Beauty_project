# Telegram approval bot

One-tap mobile approvals for generated content. Instead of running CLI commands, you get a Telegram message with **✅ Approve** and **❌ Reject** buttons.

## How it works

1. When a content pack is generated, the agent calls `requestApproval()`
2. With `NOTIFY_CHANNEL=telegram`, the message + buttons are sent via your bot
3. You tap a button on your phone
4. The bot polls Telegram, sees the button press, calls `approveContent()` or `rejectContent()`, and edits the original message to show the decision
5. Approved content can then be scheduled and published as usual

Long-polling (no webhook) — works locally with no public URL.

## One-time setup

### 1. Create a bot with @BotFather

1. On Telegram, open a chat with **@BotFather**
2. Send `/newbot`
3. Pick a display name (e.g. `Beauty Researcher`)
4. Pick a username ending in `bot` (e.g. `beauty_researcher_bot`) — must be unique
5. BotFather replies with a **token** that looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`
6. Copy this token

### 2. Get your chat ID

1. Send any message to your new bot (just `/start` or `hi` is fine)
2. In your terminal:
   ```powershell
   curl https://api.telegram.org/bot<YOUR_TOKEN_HERE>/getUpdates
   ```
3. Look for `"chat":{"id":123456789, ...}` in the response
4. That number is your **chat ID**

### 3. Add to `.env`

```env
NOTIFY_CHANNEL=telegram
TELEGRAM_BOT_TOKEN=<paste your BotFather token>
TELEGRAM_CHAT_ID=<paste your chat ID number>
```

⚠ The token is a credential. Paste it into `.env` (gitignored), never into chat.

### 4. Verify the connection

```powershell
npm run cli -- telegram-test
```

If your token + chat ID are right, you'll get a confirmation message in Telegram and the terminal will print:

```
Bot identity: @beauty_researcher_bot (id=...)
Sent message <id> to chat <id>
```

## Running the bot

You have two choices:

### A. Standalone (just the bot, no cron)

```powershell
npm run cli -- telegram-bot
```

Long-polls until you press Ctrl+C. Useful for testing.

### B. Together with the scheduler (recommended)

```powershell
npm run scheduler
```

When `NOTIFY_CHANNEL=telegram`, the scheduler **automatically starts the bot in the same process** alongside cron jobs and the publisher tick. One process, everything running.

If you've registered the Windows Task Scheduler entry, this happens at every login automatically.

## What you'll see in Telegram

Approval message format:

```
*Approval needed for content abc123*

Content type: faceless_video
Hook:         3 products. 8 hours. Glass skin by morning.
Caption:      Your skin does its best work while you sleep...
Hashtags:     #GlassSkinRoutine #OvernightSkincare ...
Asset URL:    https://database.blotato.io/...mp4
[full script + shots + prompts]

[ ✅ Approve ]  [ ❌ Reject ]
```

Tap a button. The message edits in place to:

```
... (original message)

✅ APPROVED by tg:naor705 at 2026-05-05 10:23:00
```

## Security notes

- The bot **only honors callbacks from the chat ID set in `TELEGRAM_CHAT_ID`**. Random users who find the bot can't approve your content even if they figure out the callback format.
- The bot token has full permissions on the bot (send/edit/delete messages). Treat it like a password. Rotate via @BotFather → `/revoke` if it leaks.
- Telegram's bot API is HTTPS only.

## Troubleshooting

| Problem | Fix |
|---|---|
| `getMe failed — token likely invalid` | Token is wrong or revoked. Recreate via @BotFather → `/mybots`. |
| Buttons appear but tapping does nothing | Bot polling isn't running. Run `npm run cli -- telegram-bot` or `npm run scheduler`. |
| `callback from unauthorized chat ... — dropping` | Your `TELEGRAM_CHAT_ID` doesn't match. Re-run the `/getUpdates` step to confirm. |
| No approval message arrives at all | `NOTIFY_CHANNEL` is still `console` — set to `telegram` in `.env`. |

## Customization

Want different buttons (e.g. a third "Edit time" button, or per-platform approval)? Edit the `buttons` array in [src/integrations/notify.ts](../src/integrations/notify.ts) and the action switch in [src/agents/telegram-bot.ts](../src/agents/telegram-bot.ts).

Want to receive text messages too (e.g. a free-form rejection reason)? Telegram supports this via `force_reply` markup. The current bot ignores `update.message` (only handles `callback_query`); the loop is in `runTelegramBot()` and is easy to extend.
