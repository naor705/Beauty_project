import cron from "node-cron";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { runResearchJob } from "../agents/research-agent.js";
import { runTrendAnalysisJob } from "../agents/trend-analysis-agent.js";
import { listPosts } from "../db/repositories/posts.js";
import { executeScheduledPost } from "../agents/publishing-agent.js";

const log = createLogger("scheduler");

async function tickPublisher(): Promise<void> {
  const due = listPosts(200).filter(
    (p) => p.status === "scheduled" && new Date(p.publish_at).getTime() <= Date.now(),
  );
  for (const p of due) {
    await executeScheduledPost(p.id).catch((err) =>
      log.error(`publish failed for ${p.id}`, { err: err instanceof Error ? err.message : String(err) }),
    );
  }
}

function isValidCron(expr: string | undefined): expr is string {
  return !!expr && expr.trim().length > 0 && cron.validate(expr.trim());
}

function start(): void {
  const researchExpr = env.schedule.research?.trim() ?? "";
  const reportExpr = env.schedule.report?.trim() ?? "";

  log.info("scheduler starting", {
    research: researchExpr || "(disabled — set RESEARCH_CRON in .env)",
    report: reportExpr || "(disabled — set REPORT_CRON in .env)",
    tz: env.schedule.timezone,
  });

  if (isValidCron(researchExpr)) {
    cron.schedule(
      researchExpr,
      () => {
        runResearchJob().catch((err) =>
          log.error("research cron failed", { err: err instanceof Error ? err.message : String(err) }),
        );
      },
      { timezone: env.schedule.timezone },
    );
  } else if (researchExpr) {
    log.warn(`RESEARCH_CRON value is invalid: "${researchExpr}" — research job will not fire`);
  }

  if (isValidCron(reportExpr)) {
    cron.schedule(
      reportExpr,
      () => {
        runTrendAnalysisJob().catch((err) =>
          log.error("report cron failed", { err: err instanceof Error ? err.message : String(err) }),
        );
      },
      { timezone: env.schedule.timezone },
    );
  } else if (reportExpr) {
    log.warn(`REPORT_CRON value is invalid: "${reportExpr}" — report job will not fire`);
  }

  // Publisher tick every minute — runs any due scheduled posts. Always on so
  // posts you scheduled manually still fire even before you set research/report crons.
  // Real production should use a queue (BullMQ/SQS).
  cron.schedule("* * * * *", () => {
    tickPublisher().catch((err) =>
      log.error("publisher tick failed", { err: err instanceof Error ? err.message : String(err) }),
    );
  });

  log.info("scheduler running. Ctrl-C to stop.");
}

start();
