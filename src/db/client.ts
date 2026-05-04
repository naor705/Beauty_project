import Database from "better-sqlite3";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

let _db: Database.Database | null = null;

function resolveDbPath(url: string): string {
  if (url.startsWith("file:")) return resolve(url.slice("file:".length));
  return resolve(url);
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const path = resolveDbPath(env.databaseUrl);
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = resolve(here, "schema.sql");
  if (existsSync(schemaPath)) {
    db.exec(readFileSync(schemaPath, "utf8"));
  }

  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
