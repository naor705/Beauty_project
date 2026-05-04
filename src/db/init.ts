import { getDb, closeDb } from "./client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("db:init");

function main(): void {
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  log.info(`Database initialized at ${db.name}`, { tables: tables.map((t) => t.name) });
  closeDb();
}

main();
