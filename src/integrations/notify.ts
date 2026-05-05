/**
 * Notification dispatcher. Channels: telegram | email | console.
 *
 * - Telegram: real implementation via src/integrations/telegram.ts. When an
 *   approvalId is supplied, the message includes inline ✅ Approve / ❌ Reject
 *   buttons whose callback_data is consumed by the bot polling loop.
 * - Email: still a stub. TODO(real): nodemailer with the SMTP_* env vars.
 */
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { sendTelegramMessage } from "./telegram.js";

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
    try {
      const text = `*${input.subject}*\n\n${input.body}`.slice(0, 4000); // Telegram cap is 4096
      const buttons = input.approvalId
        ? [
            [
              { text: "✅ Approve", callback_data: `approve:${input.approvalId}` },
              { text: "❌ Reject", callback_data: `reject:${input.approvalId}` },
            ],
          ]
        : undefined;
      await sendTelegramMessage(text, { parseMode: "Markdown", buttons });
      return { ok: true, channel, message: "telegram message sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("telegram send failed", { err: msg });
      return { ok: false, channel, message: msg };
    }
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
