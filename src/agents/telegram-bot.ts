/**
 * Telegram approval bot loop. Long-polls Telegram for button presses on
 * approval-request messages, routes them into the approval flow, and edits the
 * original message to show the decision.
 *
 * Idempotent on restart — if an approval is already approved/rejected, repeating
 * the action is a no-op. Polling offset is held in memory; advancing it via
 * getUpdates(offset) marks earlier updates as consumed on Telegram's side.
 */
import { createLogger } from "../utils/logger.js";
import { env } from "../config/env.js";
import {
  getUpdates,
  answerCallbackQuery,
  editMessageText,
  isAuthorizedChat,
  getMe,
  type CallbackQuery,
} from "../integrations/telegram.js";
import { approveContent, rejectContent } from "./approval-flow.js";

const log = createLogger("telegram-bot");

export interface BotOptions {
  /** AbortSignal lets a host process (CLI, scheduler) gracefully stop the loop. */
  signal?: AbortSignal;
  /** Initial poll offset; defaults to 0 (= read everything in the backlog). */
  startOffset?: number;
}

/**
 * Main loop. Returns when signal is aborted. Catches per-iteration errors so
 * a single bad update or transient network failure doesn't kill the process.
 */
export async function runTelegramBot(opts: BotOptions = {}): Promise<void> {
  if (!env.notify.telegramToken) {
    log.warn("TELEGRAM_BOT_TOKEN not set — bot loop will not start");
    return;
  }
  if (!env.notify.telegramChatId) {
    log.warn("TELEGRAM_CHAT_ID not set — bot would refuse all callbacks; loop will not start");
    return;
  }

  try {
    const me = await getMe();
    log.info(`bot @${me.username} ready (id=${me.id}); listening for approval callbacks`);
  } catch (err) {
    log.error("getMe failed — token likely invalid", {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let offset = opts.startOffset ?? 0;
  while (!opts.signal?.aborted) {
    try {
      const updates = await getUpdates(offset);
      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        if (u.callback_query) await handleCallback(u.callback_query);
        // u.message is intentionally ignored — bot is callback-only for MVP.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("poll iteration failed", { err: msg });
      // Back off briefly before retrying so we don't hammer on persistent errors.
      await sleep(5_000);
    }
  }
  log.info("bot loop stopped (signal aborted)");
}

async function handleCallback(cb: CallbackQuery): Promise<void> {
  const chatId = cb.message.chat.id;
  if (!isAuthorizedChat(chatId)) {
    log.warn(`callback from unauthorized chat ${chatId} (${cb.from.username ?? "?"}) — dropping`);
    await answerCallbackQuery(cb.id, "Not authorized");
    return;
  }

  const [action, approvalId] = cb.data.split(":", 2);
  if (!approvalId) {
    log.warn(`malformed callback_data: ${cb.data}`);
    await answerCallbackQuery(cb.id, "Invalid callback");
    return;
  }

  const decidedBy = `tg:${cb.from.username ?? cb.from.id}`;

  try {
    if (action === "approve") {
      const updated = approveContent(approvalId, decidedBy);
      await answerCallbackQuery(cb.id, "✅ Approved");
      await editMessageText(
        chatId,
        cb.message.message_id,
        `${cb.message.text ?? ""}\n\n✅ APPROVED by ${decidedBy} at ${updated.decided_at ?? new Date().toISOString()}`,
      );
      log.info(`approval ${approvalId} approved via telegram by ${decidedBy}`);
    } else if (action === "reject") {
      const updated = rejectContent(approvalId, "rejected via telegram", decidedBy);
      await answerCallbackQuery(cb.id, "❌ Rejected");
      await editMessageText(
        chatId,
        cb.message.message_id,
        `${cb.message.text ?? ""}\n\n❌ REJECTED by ${decidedBy} at ${updated.decided_at ?? new Date().toISOString()}`,
      );
      log.info(`approval ${approvalId} rejected via telegram by ${decidedBy}`);
    } else {
      log.warn(`unknown action: ${action}`);
      await answerCallbackQuery(cb.id, "Unknown action");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("callback handler failed", { err: msg, approvalId, action });
    try {
      await answerCallbackQuery(cb.id, `Error: ${msg.slice(0, 100)}`);
    } catch {
      /* swallow secondary failure */
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
