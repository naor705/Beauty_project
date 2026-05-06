/**
 * Apify integration — managed scraping for IG + TikTok hashtag research.
 *
 * Uses Apify's "run actor synchronously and get dataset items" endpoint:
 *   POST /v2/acts/<actor_id>/run-sync-get-dataset-items?token=...
 *
 * Both default actors return rich data including engagement counts (likes,
 * comments, views) — fields the official IG Graph API hides for non-owned posts.
 *
 * Pricing (rough): ~$2-4 per 1000 results. Apify gives $5/mo free credit.
 * Errors fall back to mock so the pipeline never crashes.
 */
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { computeEngagementScore } from "../utils/engagement.js";
import { createLogger } from "../utils/logger.js";
import type { ResearchResult } from "../types/index.js";

const log = createLogger("apify");

const APIFY_BASE = "https://api.apify.com/v2";

// ===========================================================================
// Low-level client
// ===========================================================================

async function runActorSync<T>(actorId: string, input: unknown, timeoutSec = 180): Promise<T[]> {
  if (!env.apify.token) throw new Error("APIFY_TOKEN not set");
  // Apify accepts both "username/actor-name" and "username~actor-name" forms;
  // the URL-safe tilde form is the canonical one for path segments.
  const actorPath = actorId.replace("/", "~");
  const url =
    `${APIFY_BASE}/acts/${actorPath}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(env.apify.token)}` +
    `&timeout=${timeoutSec}` +
    `&format=json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify ${actorId}: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T[];
}

// ===========================================================================
// Diagnostic
// ===========================================================================

export async function apifyTest(): Promise<{
  user: { id: string; username: string; email?: string };
  plan?: { id?: string; usageCycleStartAt?: string };
}> {
  if (!env.apify.token) throw new Error("APIFY_TOKEN not set");
  const url = `${APIFY_BASE}/users/me?token=${encodeURIComponent(env.apify.token)}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    data?: {
      id: string;
      username: string;
      email?: string;
      plan?: { id?: string; usageCycleStartAt?: string };
    };
    error?: { message?: string };
  };
  if (!res.ok || !data.data) {
    throw new Error(`Apify auth failed: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  return {
    user: { id: data.data.id, username: data.data.username, email: data.data.email },
    plan: data.data.plan,
  };
}

// ===========================================================================
// Instagram — hashtag scraper
//
// Common output shape from `apify/instagram-hashtag-scraper`:
//   { url, shortCode, caption, hashtags, ownerUsername, likesCount,
//     commentsCount, videoViewCount, type, timestamp, ... }
// ===========================================================================

interface ApifyInstagramPost {
  url?: string;
  shortCode?: string;
  caption?: string;
  hashtags?: string[];
  ownerUsername?: string;
  ownerId?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  type?: "Image" | "Video" | "Sidecar";
  timestamp?: string;
}

const IG_TYPE_MAP: Record<string, ResearchResult["content_format"]> = {
  Image: "image",
  Video: "reel",
  Sidecar: "carousel",
};

function mapInstagramPost(p: ApifyInstagramPost): ResearchResult {
  const likes = p.likesCount ?? 0;
  const comments = p.commentsCount ?? 0;
  const views = p.videoViewCount ?? p.videoPlayCount ?? 0;
  const cleanCaption = (p.caption ?? "").replace(/\s+/g, " ").trim();
  const title = cleanCaption.slice(0, 200) || `Instagram ${p.type ?? "post"}`;
  const hashtags = (p.hashtags ?? []).slice(0, 12).map((h) => `#${h.replace(/^#/, "")}`);
  return {
    id: nanoid(10),
    platform: "instagram",
    url: p.url ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : "(unknown)"),
    title,
    creator: p.ownerUsername ? `@${p.ownerUsername}` : "(unknown)",
    likes,
    comments,
    shares: 0,
    views,
    engagement_score: computeEngagementScore({ likes, comments, views }),
    hashtags,
    topic: "beauty care",
    content_format: IG_TYPE_MAP[p.type ?? ""] ?? "image",
    raw: p,
    found_at: new Date().toISOString(),
  };
}

export async function apifyInstagramHashtagSearch(
  hashtags: string[],
  limit = 50,
): Promise<ResearchResult[]> {
  log.info("apify IG hashtag search", { hashtags, limit });
  const items = await runActorSync<ApifyInstagramPost>(env.apify.igActor, {
    hashtags,
    resultsLimit: limit,
    resultsType: "posts",
  });
  log.info(`apify IG returned ${items.length} posts`);
  return items.map(mapInstagramPost);
}

// ===========================================================================
// TikTok — hashtag scraper
//
// Common output shape from `clockworks/free-tiktok-scraper`:
//   { webVideoUrl, text, hashtags: [{name}], authorMeta: {name, nickName},
//     diggCount, commentCount, shareCount, playCount, createTime, ... }
// ===========================================================================

interface ApifyTiktokPost {
  webVideoUrl?: string;
  videoUrl?: string;
  text?: string;
  hashtags?: Array<{ name?: string } | string>;
  authorMeta?: { name?: string; nickName?: string };
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  playCount?: number;
  createTime?: number;
  createTimeISO?: string;
}

function mapTiktokPost(p: ApifyTiktokPost): ResearchResult {
  const likes = p.diggCount ?? 0;
  const comments = p.commentCount ?? 0;
  const shares = p.shareCount ?? 0;
  const views = p.playCount ?? 0;
  const cleanText = (p.text ?? "").replace(/\s+/g, " ").trim();
  const title = cleanText.slice(0, 200) || "TikTok video";
  const hashtags = (p.hashtags ?? [])
    .map((h) => (typeof h === "string" ? h : h.name))
    .filter((s): s is string => !!s)
    .slice(0, 12)
    .map((h) => `#${h.replace(/^#/, "")}`);
  return {
    id: nanoid(10),
    platform: "tiktok",
    url: p.webVideoUrl ?? p.videoUrl ?? "(unknown)",
    title,
    creator: p.authorMeta?.name ? `@${p.authorMeta.name}` : "(unknown)",
    likes,
    comments,
    shares,
    views,
    engagement_score: computeEngagementScore({ likes, comments, shares, views }),
    hashtags,
    topic: "beauty care",
    content_format: "short_video",
    raw: p,
    found_at: new Date().toISOString(),
  };
}

export async function apifyTiktokHashtagSearch(
  hashtags: string[],
  limit = 50,
): Promise<ResearchResult[]> {
  log.info("apify TikTok hashtag search", { hashtags, limit });
  const items = await runActorSync<ApifyTiktokPost>(env.apify.ttActor, {
    hashtags,
    resultsPerPage: limit,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });
  log.info(`apify TikTok returned ${items.length} posts`);
  return items.map(mapTiktokPost);
}
