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
    // Plain text mode — URLs auto-link, no Markdown corruption. Telegram's
    // Markdown parser mishandles underscores in URLs (e.g. /public_media/...
    // inside Blotato CDN paths), turning a 200-OK URL into a broken tap target.
    const text = `${input.subject}\n\n${input.body}`.slice(0, 4000); // Telegram cap is 4096
    const approverButtons = input.approvalId
      ? [
          [
            { text: "✅ Approve", callback_data: `approve:${input.approvalId}` },
            { text: "❌ Reject", callback_data: `reject:${input.approvalId}` },
          ],
        ]
      : undefined;

    // 1) Approver gets the actionable message with buttons.
    let approverOk = false;
    try {
      await sendTelegramMessage(text, { buttons: approverButtons });
      approverOk = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("telegram send to approver failed", { err: msg });
    }

    // 2) Viewers get a view-only copy (no buttons). Failures here are non-fatal.
    const viewers = env.notify.telegramViewerChatIds.filter(
      (id) => id && id !== env.notify.telegramChatId, // never duplicate-deliver
    );
    if (viewers.length > 0) {
      const viewerText = `${text}\n\n(view-only — only the approver can decide)`;
      for (const chatId of viewers) {
        try {
          await sendTelegramMessage(viewerText, { chatId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`telegram view-only send to ${chatId} failed`, { err: msg });
        }
      }
    }

    return approverOk
      ? { ok: true, channel, message: `telegram sent (1 approver + ${viewers.length} viewers)` }
      : { ok: false, channel, message: "telegram send to approver failed" };
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
