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

function start(): void {
  log.info("scheduler starting", {
    research: env.schedule.research,
    report: env.schedule.report,
    tz: env.schedule.timezone,
  });

  cron.schedule(
    env.schedule.research,
    () => {
      runResearchJob().catch((err) =>
        log.error("research cron failed", { err: err instanceof Error ? err.message : String(err) }),
      );
    },
    { timezone: env.schedule.timezone },
  );

  cron.schedule(
    env.schedule.report,
    () => {
      runTrendAnalysisJob().catch((err) =>
        log.error("report cron failed", { err: err instanceof Error ? err.message : String(err) }),
      );
    },
    { timezone: env.schedule.timezone },
  );

  // Publisher tick every minute. Real production should use a queue (BullMQ/SQS).
  cron.schedule("* * * * *", () => {
    tickPublisher().catch((err) =>
      log.error("publisher tick failed", { err: err instanceof Error ? err.message : String(err) }),
    );
  });

  log.info("scheduler running. Ctrl-C to stop.");
}

start();
