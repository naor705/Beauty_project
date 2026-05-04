import { getDb, closeDb } from "./client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("db:reset");

const TABLES = [
  "post_logs",
  "scheduled_posts",
  "approval_requests",
  "generated_content",
  "selected_trends",
  "trend_insights",
  "trend_reports",
  "research_results",
];

function main(): void {
  const db = getDb();
  for (const t of TABLES) {
    db.exec(`DELETE FROM ${t}`);
    log.info(`cleared ${t}`);
  }
  closeDb();
}

main();
