import { getDb } from "../client.js";

export function getCached(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value, expires_at FROM kv_cache WHERE key = ?")
    .get(key) as { value: string; expires_at: string | null } | undefined;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    getDb().prepare("DELETE FROM kv_cache WHERE key = ?").run(key);
    return null;
  }
  return row.value;
}

export function setCached(key: string, value: string, ttlSeconds?: number): void {
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  getDb()
    .prepare("INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, ?)")
    .run(key, value, expiresAt);
}

export function deleteCached(key: string): void {
  getDb().prepare("DELETE FROM kv_cache WHERE key = ?").run(key);
}
