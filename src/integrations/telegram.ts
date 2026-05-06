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
  /** Present on sendVideo responses — useful for re-sending the same video to other chats. */
  video?: { file_id: string; file_unique_id?: string };
  /** Present on sendPhoto responses — array of photo sizes. Use any file_id to re-send. */
  photo?: Array<{ file_id: string; file_unique_id?: string }>;
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

export interface SendMediaOpts {
  chatId?: string;
  caption?: string;
  parseMode?: SendMessageOpts["parseMode"];
  buttons?: InlineButton[][];
}

/** True if the value looks like an http(s) URL; false implies a Telegram file_id. */
function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * Upload media to Telegram via multipart/form-data.
 *
 * Telegram has two modes to send media:
 *   1) Pass a URL → Telegram fetches it. Brittle — Telegram blacklists URLs
 *      that have failed recently, and Cloudflare may rate-limit Telegram's IPs.
 *   2) Multipart upload → we download the file once, push the bytes to Telegram.
 *      Bulletproof, and the response contains a file_id for cheap re-sends.
 *
 * This helper handles both: if `media` is a URL, download then upload;
 * if `media` is already a file_id, just reference it (no upload needed).
 */
async function uploadMedia(
  endpoint: "sendVideo" | "sendPhoto",
  mediaField: "video" | "photo",
  media: string,
  opts: SendMediaOpts,
  filename: string,
): Promise<TelegramMessage> {
  const chatId = opts.chatId ?? env.notify.telegramChatId;
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID not set and no chatId provided");

  // Fast path: if `media` is a file_id (anything not http), just JSON-post it.
  if (!looksLikeUrl(media)) {
    const body: Record<string, unknown> = { chat_id: chatId, [mediaField]: media };
    if (opts.caption) body.caption = opts.caption.slice(0, 1024);
    if (opts.parseMode) body.parse_mode = opts.parseMode;
    if (opts.buttons && opts.buttons.length > 0) {
      body.reply_markup = { inline_keyboard: opts.buttons };
    }
    if (endpoint === "sendVideo") body.supports_streaming = true;
    return tg<TelegramMessage>(endpoint, body);
  }

  // Slow path: download the URL ourselves, upload as multipart.
  const downloadRes = await fetch(media);
  if (!downloadRes.ok) {
    throw new Error(`download ${media}: HTTP ${downloadRes.status}`);
  }
  const buf = Buffer.from(await downloadRes.arrayBuffer());
  const blob = new Blob([buf], {
    type: downloadRes.headers.get("content-type") ?? "application/octet-stream",
  });

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(mediaField, blob, filename);
  if (opts.caption) form.append("caption", opts.caption.slice(0, 1024));
  if (opts.parseMode) form.append("parse_mode", opts.parseMode);
  if (opts.buttons && opts.buttons.length > 0) {
    form.append("reply_markup", JSON.stringify({ inline_keyboard: opts.buttons }));
  }
  if (endpoint === "sendVideo") form.append("supports_streaming", "true");

  const res = await fetch(`${baseUrl()}/${endpoint}`, { method: "POST", body: form });
  const data = (await res.json()) as { ok: boolean; result?: TelegramMessage; description?: string };
  if (!data.ok || !data.result) {
    throw new Error(`telegram ${endpoint}: ${data.description ?? `HTTP ${res.status}`}`);
  }
  return data.result;
}

/**
 * Send a video as a playable Telegram media message.
 * Accepts either a URL (downloaded + uploaded) or a Telegram file_id (re-used).
 * Caption max length 1024 chars. URL-based videos must be < 50 MB.
 */
export async function sendTelegramVideo(video: string, opts: SendMediaOpts = {}): Promise<TelegramMessage> {
  return uploadMedia("sendVideo", "video", video, opts, "video.mp4");
}

/**
 * Send a photo as a Telegram media message.
 * Accepts either a URL or a Telegram file_id.
 * Caption max length 1024 chars.
 */
export async function sendTelegramPhoto(photo: string, opts: SendMediaOpts = {}): Promise<TelegramMessage> {
  return uploadMedia("sendPhoto", "photo", photo, opts, "photo.jpg");
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
