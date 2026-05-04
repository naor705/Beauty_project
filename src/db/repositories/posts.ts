import { nanoid } from "nanoid";
import { getDb } from "../client.js";
import type { PostLog, PostStatus, PublishPlatform, ScheduledPost } from "../../types/index.js";

type PostRow = {
  id: string;
  generated_content_id: string;
  platform: string;
  publish_at: string;
  status: string;
  created_at: string;
};

type LogRow = {
  id: string;
  scheduled_post_id: string;
  platform: string;
  attempt: number;
  status: string;
  message: string;
  payload: string | null;
  created_at: string;
};

function toPost(r: PostRow): ScheduledPost {
  return {
    id: r.id,
    generated_content_id: r.generated_content_id,
    platform: r.platform as PublishPlatform,
    publish_at: r.publish_at,
    status: r.status as PostStatus,
    created_at: r.created_at,
  };
}

function toLog(r: LogRow): PostLog {
  return {
    id: r.id,
    scheduled_post_id: r.scheduled_post_id,
    platform: r.platform as PostLog["platform"],
    attempt: r.attempt,
    status: r.status as PostLog["status"],
    message: r.message,
    payload: r.payload ? JSON.parse(r.payload) : null,
    created_at: r.created_at,
  };
}

export function schedulePost(input: {
  generated_content_id: string;
  platform: PublishPlatform;
  publish_at: string;
}): ScheduledPost {
  const db = getDb();
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO scheduled_posts (id, generated_content_id, platform, publish_at, status)
     VALUES (?, ?, ?, ?, 'scheduled')`,
  ).run(id, input.generated_content_id, input.platform, input.publish_at);
  const row = db.prepare("SELECT * FROM scheduled_posts WHERE id = ?").get(id) as PostRow;
  return toPost(row);
}

export function setPostStatus(id: string, status: PostStatus): void {
  getDb().prepare("UPDATE scheduled_posts SET status = ? WHERE id = ?").run(status, id);
}

export function getPost(id: string): ScheduledPost | null {
  const row = getDb().prepare("SELECT * FROM scheduled_posts WHERE id = ?").get(id) as PostRow | undefined;
  return row ? toPost(row) : null;
}

export function listPosts(limit = 50): ScheduledPost[] {
  const rows = getDb()
    .prepare("SELECT * FROM scheduled_posts ORDER BY publish_at DESC LIMIT ?")
    .all(limit) as PostRow[];
  return rows.map(toPost);
}

export function appendLog(input: {
  scheduled_post_id: string;
  platform: PostLog["platform"];
  attempt: number;
  status: PostLog["status"];
  message: string;
  payload?: unknown;
}): PostLog {
  const db = getDb();
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO post_logs (id, scheduled_post_id, platform, attempt, status, message, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.scheduled_post_id,
    input.platform,
    input.attempt,
    input.status,
    input.message,
    input.payload === undefined ? null : JSON.stringify(input.payload),
  );
  const row = db.prepare("SELECT * FROM post_logs WHERE id = ?").get(id) as LogRow;
  return toLog(row);
}

export function listLogs(scheduledPostId: string): PostLog[] {
  const rows = getDb()
    .prepare("SELECT * FROM post_logs WHERE scheduled_post_id = ? ORDER BY created_at ASC")
    .all(scheduledPostId) as LogRow[];
  return rows.map(toLog);
}
