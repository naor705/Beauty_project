import { nanoid } from "nanoid";
import { getDb } from "../client.js";
import type { ResearchResult } from "../../types/index.js";

type Row = {
  id: string;
  platform: string;
  url: string;
  title: string;
  creator: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement_score: number;
  hashtags: string;
  topic: string;
  content_format: string;
  raw: string | null;
  found_at: string;
};

function rowToResult(r: Row): ResearchResult {
  return {
    id: r.id,
    platform: r.platform as ResearchResult["platform"],
    url: r.url,
    title: r.title,
    creator: r.creator,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    views: r.views,
    engagement_score: r.engagement_score,
    hashtags: JSON.parse(r.hashtags) as string[],
    topic: r.topic,
    content_format: r.content_format as ResearchResult["content_format"],
    raw: r.raw ? JSON.parse(r.raw) : null,
    found_at: r.found_at,
  };
}

export function upsertResult(input: Omit<ResearchResult, "id" | "found_at"> & { id?: string }): ResearchResult {
  const db = getDb();
  const id = input.id ?? nanoid(12);
  const stmt = db.prepare(`
    INSERT INTO research_results (
      id, platform, url, title, creator, likes, comments, shares, views,
      engagement_score, hashtags, topic, content_format, raw
    ) VALUES (
      @id, @platform, @url, @title, @creator, @likes, @comments, @shares, @views,
      @engagement_score, @hashtags, @topic, @content_format, @raw
    )
    ON CONFLICT(url) DO UPDATE SET
      likes = excluded.likes,
      comments = excluded.comments,
      shares = excluded.shares,
      views = excluded.views,
      engagement_score = excluded.engagement_score,
      hashtags = excluded.hashtags,
      topic = excluded.topic,
      content_format = excluded.content_format,
      raw = excluded.raw
  `);

  stmt.run({
    id,
    platform: input.platform,
    url: input.url,
    title: input.title,
    creator: input.creator,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    views: input.views,
    engagement_score: input.engagement_score,
    hashtags: JSON.stringify(input.hashtags),
    topic: input.topic,
    content_format: input.content_format,
    raw: input.raw === undefined ? null : JSON.stringify(input.raw),
  });

  const row = db.prepare("SELECT * FROM research_results WHERE url = ?").get(input.url) as Row;
  return rowToResult(row);
}

export function findById(id: string): ResearchResult | null {
  const row = getDb().prepare("SELECT * FROM research_results WHERE id = ?").get(id) as Row | undefined;
  return row ? rowToResult(row) : null;
}

export function listSince(sinceIso: string, limit = 1000): ResearchResult[] {
  const rows = getDb()
    .prepare("SELECT * FROM research_results WHERE found_at >= ? ORDER BY engagement_score DESC LIMIT ?")
    .all(sinceIso, limit) as Row[];
  return rows.map(rowToResult);
}

export function listTop(limit = 10): ResearchResult[] {
  const rows = getDb()
    .prepare("SELECT * FROM research_results ORDER BY engagement_score DESC LIMIT ?")
    .all(limit) as Row[];
  return rows.map(rowToResult);
}

export function countAll(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM research_results").get() as { n: number };
  return row.n;
}
