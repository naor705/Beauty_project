/**
 * Telegram Bot integration.
 *
 * Two roles:
 *   1) Outbound — sendMessage with optional inline_keyboard (approve/reject buttons).
 *   2) Inbound  — long-poll getUpdates; route callback_query button presses into
 *      our approval flow.
 *
 * Setup (see docs/TELEGRAM.md):
 *   - Create a bot with @BotFather on Telegram → get TELEGRAM_BOT_TOKEN
 *   - Send your bot any message → fetch your chat_id with /getUpdates → set TELEGRAM_CHAT_ID
 *
 * Long-polling is used (not webhooks) so this works locally with no public URL.
 * Only callbacks from TELEGRAM_CHAT_ID are honored — drops everything else.
 */
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("telegram");

// ---------------------------------------------------------------------------
// Low-level API
// ---------------------------------------------------------------------------

const TIMEOUT_SECS = 25; // long-poll window

function baseUrl(): string {
  if (!env.notify.telegramToken) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return `https://api.telegram.org/bot${env.notify.telegramToken}`;
}

async function tg<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${baseUrl()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description ?? "unknown error"}`);
  return data.result;
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface SendMessageOpts {
  chatId?: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  buttons?: InlineButton[][]; // rows of buttons
  disablePreview?: boolean;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
}

export async function sendTelegramMessage(text: string, opts: SendMessageOpts = {}): Promise<TelegramMessage> {
  const chatId = opts.chatId ?? env.notify.telegramChatId;
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID not set and no chatId provided");

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: opts.disablePreview ?? true,
  };
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.buttons && opts.buttons.length > 0) {
    body.reply_markup = { inline_keyboard: opts.buttons };
  }
  return tg<TelegramMessage>("sendMessage", body);
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  opts: { parseMode?: SendMessageOpts["parseMode"] } = {},
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
  };
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  await tg("editMessageText", body);
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await tg("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  });
}

// ---------------------------------------------------------------------------
// Inbound — long polling
// ---------------------------------------------------------------------------

export interface CallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message: { chat: { id: number }; message_id: number; text?: string };
  data: string;
}

export interface IncomingMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number; username?: string };
  text?: string;
}

export interface Update {
  update_id: number;
  callback_query?: CallbackQuery;
  message?: IncomingMessage;
}

/**
 * Long-poll for updates. Returns when at least one update arrives or after TIMEOUT_SECS.
 * Caller is responsible for advancing the offset (lastUpdateId + 1).
 */
export async function getUpdates(offset: number): Promise<Update[]> {
  const url = `${baseUrl()}/getUpdates?offset=${offset}&timeout=${TIMEOUT_SECS}&allowed_updates=${encodeURIComponent(JSON.stringify(["callback_query", "message"]))}`;
  const res = await fetch(url);
  const data = (await res.json()) as { ok: boolean; result: Update[]; description?: string };
  if (!data.ok) throw new Error(`telegram getUpdates: ${data.description ?? "unknown error"}`);
  return data.result;
}

/**
 * Authorize an inbound callback/message: only honor traffic from the configured chat.
 * Prevents random bot users from approving content if they discover the bot.
 */
export function isAuthorizedChat(chatId: number): boolean {
  const allowed = env.notify.telegramChatId;
  if (!allowed) return false;
  return String(chatId) === String(allowed);
}

/**
 * Convenience: probe the bot is reachable + your token is valid.
 * Returns the bot's @username on success, throws otherwise.
 */
export async function getMe(): Promise<{ id: number; username: string; first_name: string }> {
  return tg<{ id: number; username: string; first_name: string }>("getMe");
}
