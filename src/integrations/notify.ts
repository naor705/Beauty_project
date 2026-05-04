/**
 * Notification dispatcher. Channels: telegram | email | console.
 *
 * TODO(real):
 *   - Telegram: POST https://api.telegram.org/bot<token>/sendMessage with chat_id, text, parse_mode.
 *     For approval buttons, use reply_markup.inline_keyboard with callback_data carrying the approval id.
 *   - Email: nodemailer with the SMTP_* env vars; for HTML approvals use a transactional template.
 */
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("notify");

export interface NotifyInput {
  subject: string;
  body: string;
  approvalId?: string;
  contentId?: string;
}

export interface NotifyResult {
  ok: boolean;
  channel: "telegram" | "email" | "console";
  message: string;
}

export async function sendNotification(input: NotifyInput): Promise<NotifyResult> {
  const channel = env.notify.channel;

  if (channel === "console") {
    console.log("\n========== APPROVAL REQUEST ==========");
    console.log(`subject:    ${input.subject}`);
    if (input.approvalId) console.log(`approvalId: ${input.approvalId}`);
    if (input.contentId) console.log(`contentId:  ${input.contentId}`);
    console.log("--------------------------------------");
    console.log(input.body);
    console.log("======================================");
    if (input.approvalId) {
      console.log(`Run:  npm run cli -- approve ${input.approvalId}`);
      console.log(`Or:   npm run cli -- reject ${input.approvalId} --reason "..."`);
    }
    console.log("");
    return { ok: true, channel, message: "logged to console" };
  }

  if (channel === "telegram") {
    if (!env.notify.telegramToken || !env.notify.telegramChatId) {
      log.warn("telegram channel selected but credentials missing");
      return { ok: false, channel, message: "missing TELEGRAM_BOT_TOKEN/CHAT_ID" };
    }
    // TODO(real): fetch(`https://api.telegram.org/bot${token}/sendMessage`, ...)
    log.warn("telegram send not yet implemented");
    return { ok: false, channel, message: "telegram not implemented" };
  }

  if (channel === "email") {
    if (!env.notify.smtpHost) {
      log.warn("email channel selected but SMTP not configured");
      return { ok: false, channel, message: "missing SMTP config" };
    }
    // TODO(real): nodemailer.createTransport({...}).sendMail({...})
    log.warn("email send not yet implemented");
    return { ok: false, channel, message: "email not implemented" };
  }

  return { ok: false, channel, message: "unknown channel" };
}
