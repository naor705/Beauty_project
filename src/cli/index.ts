#!/usr/bin/env node
import { Command } from "commander";
import { runResearchJob } from "../agents/research-agent.js";
import { runTrendAnalysisJob } from "../agents/trend-analysis-agent.js";
import { runContentGeneration } from "../agents/content-agent.js";
import {
  approveContent,
  rejectContent,
  requestApproval,
  getApprovalById,
} from "../agents/approval-flow.js";
import { scheduleApprovedPost, executeScheduledPost } from "../agents/publishing-agent.js";
import { listTop, countAll, findById as findResult } from "../db/repositories/research.js";
import { listReports, latestReport, getReport, listInsights } from "../db/repositories/reports.js";
import { createSelection, listSelections } from "../db/repositories/selections.js";
import { listForSelection, getContent } from "../db/repositories/content.js";
import { listPosts, listLogs } from "../db/repositories/posts.js";
import { listPendingApprovals } from "../db/repositories/approvals.js";
import { listTools } from "../mcp/tools.js";
import { closeDb } from "../db/client.js";
import { listTemplates, getTemplate } from "../integrations/blotato.js";
import { igTest, searchBeautyReels } from "../integrations/instagram.js";
import {
  apifyTest,
  apifyInstagramHashtagSearch,
  apifyTiktokHashtagSearch,
} from "../integrations/apify.js";
import { runTelegramBot } from "../agents/telegram-bot.js";
import { getMe as telegramGetMe, sendTelegramMessage } from "../integrations/telegram.js";
import type { ContentType, PublishPlatform } from "../types/index.js";

const program = new Command();

program
  .name("beauty")
  .description("Beauty Researcher MVP — research, report, generate, approve, schedule")
  .version("0.1.0");

// ---------------------- Research ----------------------

program
  .command("research")
  .description("Run a single research pass across configured sources")
  .option("-n, --niche <niche>", "niche/topic")
  .option("-l, --limit <limit>", "results per source", (v) => Number(v))
  .option("--include-optional", "include YouTube + Reddit mocks", false)
  .action(async (opts) => {
    const out = await runResearchJob({
      niche: opts.niche,
      perSource: opts.limit,
      includeOptional: opts.includeOptional,
    });
    console.log(`Saved ${out.saved}/${out.total}. Top samples:`);
    for (const r of out.topSample) console.log(`  [${r.engagement_score}] ${r.platform} — ${r.title}`);
  });

program
  .command("top")
  .description("Show top results currently in DB")
  .option("-n, --limit <limit>", "how many", (v) => Number(v), 10)
  .action((opts: { limit: number }) => {
    console.log(`Total stored results: ${countAll()}`);
    for (const r of listTop(opts.limit)) {
      console.log(
        `  ${r.id} [${r.engagement_score}] ${r.platform.padEnd(10)} ${r.creator.padEnd(24)} ${r.title}`,
      );
    }
  });

// ---------------------- Reports ----------------------

program
  .command("report")
  .description("Generate a 3-day top-N trend report")
  .option("-w, --window <days>", "window in days", (v) => Number(v), 3)
  .option("-n, --top <n>", "top N", (v) => Number(v), 10)
  .action(async (opts: { window: number; top: number }) => {
    const r = await runTrendAnalysisJob({ windowDays: opts.window, topN: opts.top });
    console.log(`Report ${r.id} created`);
    console.log(r.summary);
    for (const ins of listInsights(r.id)) {
      const result = findResult(ins.result_id);
      console.log(
        `\n#${ins.rank} ${result?.title ?? "(missing)"} (${result?.platform}) — score=${result?.engagement_score}`,
      );
      console.log(`  result_id: ${ins.result_id}`);
      console.log(`  hook:      ${ins.hook}`);
      console.log(`  why:       ${ins.why_it_works}`);
      console.log(`  pain:      ${ins.pain_point}`);
      console.log(`  angle:     ${ins.product_angle}`);
      console.log(`  idea:      ${ins.content_idea}`);
      console.log(`  format:    ${ins.recommended_format}`);
    }
  });

program
  .command("reports")
  .description("List recent reports")
  .action(() => {
    for (const r of listReports(20)) {
      console.log(`  ${r.id} ${r.generated_at} — top ${r.top_result_ids.length}`);
    }
  });

program
  .command("show-report <reportId>")
  .description("Show a specific report by id (use 'latest' for the newest)")
  .action((reportId: string) => {
    const r = reportId === "latest" ? latestReport() : getReport(reportId);
    if (!r) return console.error("not found");
    console.log(`Report ${r.id}  generated ${r.generated_at}`);
    console.log(r.summary);
    for (const ins of listInsights(r.id)) {
      const result = findResult(ins.result_id);
      console.log(`\n#${ins.rank} (${ins.result_id}) ${result?.title ?? "?"}`);
      console.log(`  hook:   ${ins.hook}`);
      console.log(`  format: ${ins.recommended_format}`);
    }
  });

// ---------------------- Selection + content ----------------------

program
  .command("select")
  .description("Select a trend from a report and queue content production")
  .requiredOption("-r, --report <id>", "report id (or 'latest')")
  .requiredOption("-i, --result <id>", "research result id")
  .requiredOption("-t, --type <type>", "image | caption_post | faceless_video | generated_video")
  .requiredOption("-p, --platform <platform>", "tiktok | instagram | both")
  .option("--publish-at <iso>", "ISO timestamp for publish")
  .option("--notes <notes>", "free-form notes")
  .action(
    (opts: {
      report: string;
      result: string;
      type: ContentType;
      platform: PublishPlatform;
      publishAt?: string;
      notes?: string;
    }) => {
      const reportId = opts.report === "latest" ? latestReport()?.id : opts.report;
      if (!reportId) return console.error("no report");
      const sel = createSelection({
        report_id: reportId,
        result_id: opts.result,
        content_type: opts.type,
        target_platform: opts.platform,
        publish_at: opts.publishAt ?? null,
        notes: opts.notes ?? null,
      });
      console.log(`selection ${sel.id} created`);
    },
  );

program
  .command("selections")
  .description("List recent selections")
  .action(() => {
    for (const s of listSelections(50)) {
      console.log(
        `  ${s.id} report=${s.report_id} result=${s.result_id} type=${s.content_type} platform=${s.target_platform}`,
      );
    }
  });

program
  .command("generate <selectionId>")
  .description("Generate content for a selected trend")
  .action(async (selectionId: string) => {
    const c = await runContentGeneration({ selectedTrendId: selectionId });
    console.log(`generated content ${c.id}`);
    console.log(`  hook:    ${c.hook}`);
    console.log(`  caption: ${c.caption}`);
    console.log(`  hashtags:${c.hashtags.join(" ")}`);
    if (c.asset_url) console.log(`  asset:   ${c.asset_url}`);
  });

program
  .command("show-content <contentId>")
  .description("Print stored generated content")
  .action((id: string) => {
    const c = getContent(id);
    if (!c) return console.error("not found");
    console.log(JSON.stringify(c, null, 2));
  });

program
  .command("contents-for <selectionId>")
  .description("List generated content rows for a selection")
  .action((selectionId: string) => {
    for (const c of listForSelection(selectionId)) {
      console.log(`  ${c.id} ${c.content_type} created=${c.created_at}`);
    }
  });

// ---------------------- Approvals ----------------------

program
  .command("request-approval <contentId>")
  .description("Send an approval request notification for generated content")
  .action(async (contentId: string) => {
    const a = await requestApproval({ generatedContentId: contentId });
    console.log(`approval ${a.id} (status=${a.status}) created via ${a.channel}`);
  });

program
  .command("approve <approvalId>")
  .description("Approve a pending approval request")
  .option("--by <name>", "decided_by", "cli")
  .action((approvalId: string, opts: { by: string }) => {
    const a = approveContent(approvalId, opts.by);
    console.log(`approval ${a.id} -> ${a.status}`);
  });

program
  .command("reject <approvalId>")
  .description("Reject a pending approval request")
  .requiredOption("--reason <reason>", "rejection reason")
  .option("--by <name>", "decided_by", "cli")
  .action((approvalId: string, opts: { reason: string; by: string }) => {
    const a = rejectContent(approvalId, opts.reason, opts.by);
    console.log(`approval ${a.id} -> ${a.status}`);
  });

program
  .command("approval <approvalId>")
  .description("Show an approval request")
  .action((id: string) => {
    const a = getApprovalById(id);
    console.log(a ? JSON.stringify(a, null, 2) : "not found");
  });

program
  .command("pending-approvals")
  .description("List pending approval requests")
  .action(() => {
    for (const a of listPendingApprovals()) {
      console.log(`  ${a.id} content=${a.generated_content_id} channel=${a.channel} requested=${a.requested_at}`);
    }
  });

// ---------------------- Scheduling + publishing ----------------------

program
  .command("schedule")
  .description("Schedule an approved post")
  .requiredOption("-c, --content <id>", "generated_content id")
  .requiredOption("-p, --platform <platform>", "tiktok | instagram | both")
  .requiredOption("-a, --at <iso>", "ISO timestamp")
  .action((opts: { content: string; platform: PublishPlatform; at: string }) => {
    const posts = scheduleApprovedPost({
      generatedContentId: opts.content,
      platform: opts.platform,
      publishAt: opts.at,
    });
    for (const p of posts) console.log(`scheduled ${p.id} on ${p.platform} for ${p.publish_at}`);
  });

program
  .command("publish-now <postId>")
  .description("Execute a scheduled post immediately (still gated on approval + DRY_RUN)")
  .action(async (postId: string) => {
    await executeScheduledPost(postId);
    for (const log of listLogs(postId)) {
      console.log(`  [${log.status}] attempt=${log.attempt} ${log.platform} — ${log.message}`);
    }
  });

program
  .command("posts")
  .description("List scheduled posts")
  .action(() => {
    for (const p of listPosts(50)) {
      console.log(`  ${p.id} ${p.status.padEnd(10)} ${p.platform.padEnd(10)} at ${p.publish_at}`);
    }
  });

program
  .command("post-logs <postId>")
  .description("Show logs for a scheduled post")
  .action((id: string) => {
    for (const l of listLogs(id)) {
      console.log(`  ${l.created_at} [${l.status}] attempt=${l.attempt} ${l.platform} — ${l.message}`);
    }
  });

// ---------------------- Blotato templates ----------------------

program
  .command("templates")
  .description("List Blotato video templates (requires BLOTATO_API_KEY)")
  .option("-s, --search <term>", "filter by title/description")
  .option("--full", "include the full inputs schema for each template", false)
  .action(async (opts: { search?: string; full: boolean }) => {
    const fields = opts.full ? "id,title,description,inputs" : "id,title,description";
    const res = await listTemplates({ search: opts.search, fields });
    for (const t of res.items) {
      console.log(`\n${t.id}`);
      if (t.title) console.log(`  title:       ${t.title}`);
      if (t.description) console.log(`  description: ${t.description}`);
      if (opts.full && t.inputs) {
        console.log(`  inputs:`);
        console.log(
          JSON.stringify(t.inputs, null, 2)
            .split("\n")
            .map((l) => "    " + l)
            .join("\n"),
        );
      }
    }
    console.log(`\n(${res.items.length} templates)`);
  });

program
  .command("template <id>")
  .description("Show one Blotato template with its full inputs schema")
  .action(async (id: string) => {
    const t = await getTemplate(id);
    if (!t) return console.error("not found");
    console.log(JSON.stringify(t, null, 2));
  });

// ---------------------- Apify (managed scraping) ----------------------

program
  .command("apify-test")
  .description("Verify APIFY_TOKEN works (free — just hits /users/me)")
  .action(async () => {
    const r = await apifyTest();
    console.log(`Apify connected:`);
    console.log(`  user:    @${r.user.username} (id=${r.user.id})`);
    if (r.user.email) console.log(`  email:   ${r.user.email}`);
    if (r.plan?.id) console.log(`  plan:    ${r.plan.id}`);
    console.log(`\nReady. Run 'npm run cli -- apify-research' to fetch real trends (will use credit).`);
  });

program
  .command("apify-research")
  .description(
    "Fetch real top beauty posts from IG + TikTok via Apify (no DB writes; uses Apify credit)",
  )
  .option("-l, --limit <n>", "results per platform", (v) => Number(v), 20)
  .option("--ig-only", "skip TikTok", false)
  .option("--tt-only", "skip Instagram", false)
  .action(async (opts: { limit: number; igOnly: boolean; ttOnly: boolean }) => {
    const hashtags = ["skincare", "beautycare", "skincareroutine", "glassskin", "beautytips"];

    let ig: Awaited<ReturnType<typeof apifyInstagramHashtagSearch>> = [];
    let tt: Awaited<ReturnType<typeof apifyTiktokHashtagSearch>> = [];

    if (!opts.ttOnly) {
      console.log("Fetching from Instagram...");
      ig = await apifyInstagramHashtagSearch(hashtags, opts.limit);
      console.log(`  ${ig.length} IG posts`);
    }
    if (!opts.igOnly) {
      console.log("Fetching from TikTok...");
      tt = await apifyTiktokHashtagSearch(hashtags, opts.limit);
      console.log(`  ${tt.length} TikTok posts`);
    }

    const all = [...ig, ...tt].sort((a, b) => b.engagement_score - a.engagement_score);
    console.log(`\n=== Top ${Math.min(20, all.length)} across both platforms ===\n`);
    for (const r of all.slice(0, 20)) {
      console.log(
        `[${String(r.engagement_score).padStart(8)}] ${r.platform.padEnd(10)} ${r.creator.padEnd(20)} ${r.title.slice(0, 70)}`,
      );
      console.log(`            ${r.url}`);
    }
  });

// ---------------------- Instagram research ----------------------

program
  .command("ig-test")
  .description("Diagnose INSTAGRAM_ACCESS_TOKEN + BUSINESS_ACCOUNT_ID — auto-discovers the right IG Business Account ID")
  .action(async () => {
    const r = await igTest();
    console.log("=== Instagram Graph API diagnostic ===\n");

    if (r.me) {
      console.log(`Token represents:        ${r.me.id} ${r.me.name ? `(${r.me.name})` : ""}`);
    } else {
      console.log("Token /me lookup failed — token may be invalid or expired");
    }

    if (r.permissions && r.permissions.length > 0) {
      console.log(`Granted permissions:     ${r.permissions.join(", ")}`);
    }

    if (r.igBusinessAccount) {
      console.log(
        `Linked IG Business Acct: ${r.igBusinessAccount.id}` +
          (r.igBusinessAccount.username ? ` (@${r.igBusinessAccount.username})` : "") +
          (r.igBusinessAccount.name ? ` — ${r.igBusinessAccount.name}` : ""),
      );
    }

    if (r.pages && r.pages.length > 0) {
      console.log(`\nPages this token can manage (${r.pages.length}):`);
      for (const p of r.pages) {
        const ig = p.igBusinessAccountId
          ? `IG=${p.igBusinessAccountId}${p.igUsername ? ` (@${p.igUsername})` : ""}`
          : "no linked IG Business Account";
        console.log(`  • Page ${p.id} — ${p.name}  →  ${ig}`);
      }
    }

    console.log(`\nIn .env:`);
    console.log(`  INSTAGRAM_BUSINESS_ACCOUNT_ID=${r.configuredAccountId || "(empty)"}`);
    console.log(`  Works for hashtag search:    ${r.configuredAccountWorks ? "✅ yes" : "❌ no"}`);

    if (r.notes.length > 0) {
      console.log("\nNotes:");
      for (const n of r.notes) console.log(`  • ${n}`);
    }

    if (r.configuredAccountWorks) {
      console.log("\nReady. Run 'npm run cli -- ig-research' to fetch real beauty trends.");
    } else if (r.igBusinessAccount) {
      console.log(`\nFix: edit .env line for INSTAGRAM_BUSINESS_ACCOUNT_ID, paste ${r.igBusinessAccount.id}, save.`);
    }
  });

program
  .command("ig-research")
  .description("Fetch real top beauty-care reels from Instagram (uses Graph API, no DB writes)")
  .option("-l, --limit <n>", "how many to fetch", (v) => Number(v), 10)
  .action(async (opts: { limit: number }) => {
    const results = await searchBeautyReels({ niche: "beauty care", limit: opts.limit });
    console.log(`Got ${results.length} results:\n`);
    for (const r of results) {
      console.log(`[${r.engagement_score}] ${r.creator} — ${r.title.slice(0, 80)}`);
      console.log(`  url:    ${r.url}`);
      console.log(`  format: ${r.content_format}, likes: ${r.likes}, comments: ${r.comments}`);
      console.log("");
    }
  });

// ---------------------- Telegram bot ----------------------

program
  .command("telegram-bot")
  .description("Run the Telegram approval bot loop (long-poll until Ctrl+C)")
  .action(async () => {
    const ac = new AbortController();
    process.on("SIGINT", () => ac.abort());
    process.on("SIGTERM", () => ac.abort());
    await runTelegramBot({ signal: ac.signal });
  });

program
  .command("telegram-test")
  .description("Send a test message to TELEGRAM_CHAT_ID to confirm the bot setup")
  .action(async () => {
    const me = await telegramGetMe();
    console.log(`Bot identity: @${me.username} (id=${me.id})`);
    const msg = await sendTelegramMessage(
      "✅ Beauty Researcher bot is connected.\n\nIf you can read this, your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set correctly.",
    );
    console.log(`Sent message ${msg.message_id} to chat ${msg.chat.id}`);
  });

program
  .command("telegram-demo")
  .description(
    "Full pipeline with REAL Telegram approval — runs research/report/select/generate, sends approval message to your phone, waits for ✅/❌ tap, then schedules + (DRY_RUN) publishes",
  )
  .option("--timeout <minutes>", "how long to wait for human approval", (v) => Number(v), 10)
  .option("--type <type>", "content type", "faceless_video")
  .option("--platform <platform>", "publish target", "instagram")
  .option("--keep-data", "do not reset the database first", false)
  .action(
    async (opts: {
      timeout: number;
      type: ContentType;
      platform: PublishPlatform;
      keepData: boolean;
    }) => {
      const { env } = await import("../config/env.js");
      if (env.notify.channel !== "telegram") {
        console.error("NOTIFY_CHANNEL must be 'telegram' in .env");
        process.exit(1);
      }
      const step = (n: number, msg: string) => console.log(`\n=== STEP ${n}: ${msg} ===`);

      // Start bot loop in the background. signal aborted in finally to clean up.
      const ac = new AbortController();
      const botPromise = runTelegramBot({ signal: ac.signal });

      try {
        if (!opts.keepData) {
          step(0, "reset database");
          const { getDb } = await import("../db/client.js");
          const db = getDb();
          for (const t of [
            "post_logs",
            "scheduled_posts",
            "approval_requests",
            "generated_content",
            "selected_trends",
            "trend_insights",
            "trend_reports",
            "research_results",
          ]) {
            db.exec(`DELETE FROM ${t}`);
          }
          console.log("  cleared");
        }

        step(1, "research");
        const research = await runResearchJob({ perSource: 10, includeOptional: true });
        console.log(`  saved=${research.saved}`);

        step(2, "trend analysis");
        const report = await runTrendAnalysisJob({ windowDays: 3, topN: 10 });
        console.log(`  report=${report.id}`);

        const top = listTop(1)[0];
        if (!top) throw new Error("no research results");

        step(3, `select trend: "${top.title}"`);
        const sel = createSelection({
          report_id: report.id,
          result_id: top.id,
          content_type: opts.type,
          target_platform: opts.platform,
        });
        console.log(`  selection=${sel.id}`);

        step(4, "generate content (Claude + Blotato render)");
        const content = await runContentGeneration({ selectedTrendId: sel.id });
        console.log(`  content=${content.id}`);
        console.log(`  asset:  ${content.asset_url}`);

        step(5, `request approval via Telegram (waiting up to ${opts.timeout} min)`);
        const approval = await requestApproval({ generatedContentId: content.id });
        console.log(`  approval=${approval.id}`);
        console.log(`  📱 Check your phone — tap ✅ or ❌ on the message from @Beauty_Research_Project_bot`);

        const deadline = Date.now() + opts.timeout * 60_000;
        let decided = approval;
        const startWait = Date.now();
        while (decided.status === "pending" && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2_000));
          decided = getApprovalById(approval.id) ?? decided;
          const elapsedSec = Math.floor((Date.now() - startWait) / 1000);
          if (elapsedSec % 30 === 0) console.log(`  ...still waiting (${elapsedSec}s)`);
        }

        if (decided.status === "pending") {
          console.error(`\n⏱  Timed out after ${opts.timeout} min. Approval still pending.`);
          console.error(`    You can still approve/reject later with:`);
          console.error(`      npm run cli -- approve ${approval.id}`);
          console.error(`      npm run cli -- reject  ${approval.id} --reason "..."`);
          return;
        }

        if (decided.status === "rejected") {
          console.log(`\n❌ REJECTED by ${decided.decided_by}: ${decided.reason ?? "(no reason)"}`);
          console.log(`    Content row ${content.id} is preserved.`);
          return;
        }

        console.log(`\n✅ APPROVED by ${decided.decided_by} at ${decided.decided_at}`);

        step(6, "schedule (1 minute from now)");
        const publishAt = new Date(Date.now() + 60_000).toISOString();
        const posts = scheduleApprovedPost({
          generatedContentId: content.id,
          platform: opts.platform,
          publishAt,
        });
        for (const p of posts) console.log(`  post=${p.id}  platform=${p.platform}`);

        step(7, "publish-now (DRY_RUN respected)");
        for (const p of posts) {
          await executeScheduledPost(p.id);
          for (const lg of listLogs(p.id)) {
            console.log(`  [${lg.status}] ${lg.platform} attempt=${lg.attempt} — ${lg.message}`);
          }
        }

        console.log(`\nDone. Inspect any artifact:`);
        console.log(`  npm run cli -- show-content ${content.id}`);
      } finally {
        ac.abort();
        // Bot loop exits on next poll iteration. Force-exit so we don't hang for ~25s.
        setTimeout(() => process.exit(0), 100);
      }
    },
  );

program
  .command("telegram-find-chat-id")
  .description("Print chat IDs of any chats that recently messaged your bot (after you DM it)")
  .action(async () => {
    const me = await telegramGetMe();
    console.log(`Bot identity: @${me.username} (id=${me.id})`);
    const { getUpdates } = await import("../integrations/telegram.js");
    const updates = await getUpdates(0);
    if (updates.length === 0) {
      console.log("\nNo updates found. Make sure you've sent your bot a message first:");
      console.log(`  1. Open Telegram, search for @${me.username}`);
      console.log(`  2. Send it any message (e.g. 'hi')`);
      console.log(`  3. Re-run this command`);
      return;
    }
    const chats = new Map<number, { name: string; lastMessage?: string }>();
    for (const u of updates) {
      const m = u.message ?? u.callback_query?.message;
      if (!m) continue;
      const id = m.chat.id;
      const username = u.message?.from?.username ?? u.callback_query?.from?.username;
      chats.set(id, {
        name: username ? `@${username}` : `(no username, id=${id})`,
        lastMessage: u.message?.text?.slice(0, 60),
      });
    }
    console.log("\nChats that have messaged this bot:");
    for (const [id, info] of chats) {
      console.log(`  chat_id=${id}   ${info.name}${info.lastMessage ? `   last: "${info.lastMessage}"` : ""}`);
    }
    console.log("\nCopy the chat_id you want and paste it into .env as TELEGRAM_CHAT_ID.");
  });

// ---------------------- MCP ----------------------

program
  .command("tools")
  .description("List MCP-ready tool contracts")
  .action(() => {
    for (const t of listTools()) {
      console.log(`  ${t.name.padEnd(28)} — ${t.description}`);
    }
  });

// ---------------------- Demo (end-to-end smoke test) ----------------------

program
  .command("demo")
  .description("Run the full pipeline end-to-end with current providers (safe with mock + DRY_RUN)")
  .option("--keep-data", "do not reset the database first", false)
  .option("--type <type>", "content type to generate", "faceless_video")
  .option("--platform <platform>", "publish target", "both")
  .action(
    async (opts: { keepData: boolean; type: ContentType; platform: PublishPlatform }) => {
      const step = (n: number, msg: string) => console.log(`\n=== STEP ${n}: ${msg} ===`);

      if (!opts.keepData) {
        step(0, "reset database");
        const { getDb } = await import("../db/client.js");
        const db = getDb();
        for (const t of [
          "post_logs",
          "scheduled_posts",
          "approval_requests",
          "generated_content",
          "selected_trends",
          "trend_insights",
          "trend_reports",
          "research_results",
        ]) {
          db.exec(`DELETE FROM ${t}`);
        }
        console.log("  cleared");
      }

      step(1, "research (mock TikTok + Instagram + YouTube + Reddit)");
      const research = await runResearchJob({ perSource: 10, includeOptional: true });
      console.log(`  saved=${research.saved} total=${research.total}`);

      step(2, "trend analysis (top 10, per-trend insights)");
      const report = await runTrendAnalysisJob({ windowDays: 3, topN: 10 });
      console.log(`  report=${report.id}`);
      console.log(`  summary: ${report.summary}`);

      const top = listTop(1)[0];
      if (!top) throw new Error("no research results — research step failed");

      step(3, `select trend: "${top.title}"`);
      const sel = createSelection({
        report_id: report.id,
        result_id: top.id,
        content_type: opts.type,
        target_platform: opts.platform,
      });
      console.log(`  selection=${sel.id}  type=${sel.content_type}  platform=${sel.target_platform}`);

      step(4, "generate content");
      const content = await runContentGeneration({ selectedTrendId: sel.id });
      console.log(`  content=${content.id}`);
      console.log(`  hook:     ${content.hook}`);
      console.log(`  caption:  ${content.caption.split("\n")[0]}...`);
      console.log(`  hashtags: ${content.hashtags.join(" ")}`);
      if (content.script) console.log(`  script:   ${content.script.split("\n").length} lines`);
      if (content.shot_list) console.log(`  shots:    ${content.shot_list.length}`);
      if (content.asset_url) console.log(`  asset:    ${content.asset_url}`);

      step(5, "request approval (auto-approves immediately for demo)");
      const approval = await requestApproval({ generatedContentId: content.id });
      const decided = approveContent(approval.id, "demo");
      console.log(`  approval=${approval.id} -> ${decided.status}`);

      step(6, "schedule (1 minute from now)");
      const publishAt = new Date(Date.now() + 60_000).toISOString();
      const posts = scheduleApprovedPost({
        generatedContentId: content.id,
        platform: opts.platform,
        publishAt,
      });
      for (const p of posts) console.log(`  post=${p.id}  platform=${p.platform}  at=${p.publish_at}`);

      step(7, "publish-now (respects DRY_RUN; also enforces approval check)");
      for (const p of posts) {
        await executeScheduledPost(p.id);
        for (const lg of listLogs(p.id)) {
          console.log(`  [${lg.status}] ${lg.platform} attempt=${lg.attempt} — ${lg.message}`);
        }
      }

      step(8, "summary");
      console.log(`  research_results: ${countAll()}`);
      console.log(`  reports:          ${listReports(100).length}`);
      console.log(`  selections:       ${listSelections(100).length}`);
      console.log(`  scheduled_posts:  ${listPosts(100).length}`);
      console.log("\nDone. Inspect any artifact:");
      console.log(`  npm run cli -- show-content ${content.id}`);
      console.log(`  npm run cli -- show-report ${report.id}`);
      for (const p of posts) console.log(`  npm run cli -- post-logs ${p.id}`);
    },
  );

// ---------------------- Run ----------------------

program.hook("postAction", () => closeDb());
program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
