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
import {
  sendTelegramMessage,
  sendTelegramVideo,
  sendTelegramPhoto,
  type InlineButton,
} from "./telegram.js";
import { getContent } from "../db/repositories/content.js";

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
    // Plain text mode — URLs auto-link, no Markdown corruption.
    const text = `${input.subject}\n\n${input.body}`.slice(0, 4000); // Telegram cap is 4096
    const approverButtons: InlineButton[][] | undefined = input.approvalId
      ? [
          [
            { text: "✅ Approve", callback_data: `approve:${input.approvalId}` },
            { text: "❌ Reject", callback_data: `reject:${input.approvalId}` },
          ],
        ]
      : undefined;

    // If the approval is about a piece of generated content with a video or
    // image asset, send the actual media (plays/displays inline in Telegram)
    // instead of a URL the user has to tap. Caption gets a 1024-char trim.
    const content = input.contentId ? getContent(input.contentId) : null;
    const mediaUrl = content?.asset_url ?? null;
    const isVideo =
      mediaUrl && (content?.content_type === "faceless_video" || content?.content_type === "generated_video");
    const isImage = mediaUrl && content?.content_type === "image";

    const approverCaption = text.slice(0, 1024);
    const viewers = env.notify.telegramViewerChatIds.filter(
      (id) => id && id !== env.notify.telegramChatId,
    );
    const viewerCaption = `${text}\n\n(view-only — only the approver can decide)`.slice(0, 1024);
    const viewerText = `${text}\n\n(view-only — only the approver can decide)`.slice(0, 4000);

    let approverOk = false;
    let cachedFileId: string | null = null;
    try {
      if (isVideo && mediaUrl) {
        const sent = await sendTelegramVideo(mediaUrl, { caption: approverCaption, buttons: approverButtons });
        cachedFileId = sent.video?.file_id ?? null;
        log.debug("approver video send response", {
          message_id: sent.message_id,
          videoFileId: cachedFileId,
          fullKeys: Object.keys(sent),
        });
      } else if (isImage && mediaUrl) {
        const sent = await sendTelegramPhoto(mediaUrl, { caption: approverCaption, buttons: approverButtons });
        cachedFileId = sent.photo?.[sent.photo.length - 1]?.file_id ?? null;
      } else {
        await sendTelegramMessage(text, { buttons: approverButtons });
      }
      approverOk = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("telegram send to approver failed", { err: msg });
    }

    // Viewer copies — re-use the file_id we got from the first send (avoids
    // Telegram re-fetching the URL, which sometimes errors with "wrong type
    // of the web page content" on rapid duplicate fetches).
    if (viewers.length > 0) {
      for (const chatId of viewers) {
        try {
          if (isVideo && (cachedFileId ?? mediaUrl)) {
            await sendTelegramVideo(cachedFileId ?? (mediaUrl as string), { chatId, caption: viewerCaption });
          } else if (isImage && (cachedFileId ?? mediaUrl)) {
            await sendTelegramPhoto(cachedFileId ?? (mediaUrl as string), { chatId, caption: viewerCaption });
          } else {
            await sendTelegramMessage(viewerText, { chatId });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`telegram view-only send to ${chatId} failed`, { err: msg });
        }
      }
    }

    return approverOk
      ? {
          ok: true,
          channel,
          message: `telegram sent (1 approver + ${viewers.length} viewers, ${isVideo ? "video" : isImage ? "photo" : "text"})`,
        }
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
