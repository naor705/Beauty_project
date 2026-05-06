/**
 * Instagram integration — research (Graph API hashtag search) and publishing
 * (Graph API container -> publish, currently a stub).
 *
 * Research:
 *   - GET /v22.0/ig_hashtag_search?user_id=<biz_id>&q=<hashtag>  → hashtag id
 *   - GET /v22.0/<hashtag_id>/top_media?user_id=<biz_id>&fields=...  → top posts
 *
 * Hashtag IDs are stable and rate-limited (max 30 unique per 7 days per user),
 * so we cache them in the kv_cache table for 30 days.
 *
 * If INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID is missing — or
 * any Graph API call fails — we transparently fall back to the mock dataset.
 *
 * Publishing is still a stub. TODO(real):
 *   1) POST /<ig-user-id>/media (image_url|video_url, caption, media_type)
 *   2) Poll GET /{container-id}?fields=status_code until FINISHED
 *   3) POST /<ig-user-id>/media_publish?creation_id=...
 */
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { computeEngagementScore } from "../utils/engagement.js";
import { createLogger } from "../utils/logger.js";
import { getCached, setCached } from "../db/repositories/cache.js";
import { apifyInstagramHashtagSearch } from "./apify.js";
import type { ResearchResult } from "../types/index.js";
import type { PublishResult, TikTokPublishPayload } from "./tiktok.js";

const log = createLogger("instagram");

// ===========================================================================
// Constants
// ===========================================================================

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

// Seed hashtags used to discover beauty-care content. Adjust to taste.
// Keep this short (≤5) — Instagram limits to 30 unique hashtags per 7 days per user.
const BEAUTY_HASHTAGS = ["skincare", "beautycare", "skincareroutine", "glassskin", "beautytips"];

const HASHTAG_ID_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — IDs are stable

// ===========================================================================
// Types
// ===========================================================================

export interface InstagramSearchInput {
  niche: string;
  limit?: number;
}

interface HashtagMedia {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  username?: string;
}

interface IgError {
  error?: { message?: string; type?: string; code?: number };
}

// ===========================================================================
// Low-level Graph API client
// ===========================================================================

async function ig<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!env.social.instagramToken) throw new Error("INSTAGRAM_ACCESS_TOKEN missing");
  const usp = new URLSearchParams({ access_token: env.social.instagramToken, ...params });
  const url = `${GRAPH_BASE}${path}?${usp.toString()}`;
  const res = await fetch(url);
  const data = (await res.json()) as T & IgError;
  if (!res.ok || data.error) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`IG ${path}: ${msg}`);
  }
  return data;
}

async function getHashtagId(hashtag: string, userId: string): Promise<string> {
  const cacheKey = `ig:hashtag_id:${hashtag.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await ig<{ data: Array<{ id: string }> }>("/ig_hashtag_search", {
    user_id: userId,
    q: hashtag,
  });
  const id = res.data[0]?.id;
  if (!id) throw new Error(`hashtag #${hashtag} not found`);
  setCached(cacheKey, id, HASHTAG_ID_TTL_SECONDS);
  return id;
}

async function getTopMedia(hashtagId: string, userId: string, limit: number): Promise<HashtagMedia[]> {
  const res = await ig<{ data: HashtagMedia[] }>(`/${hashtagId}/top_media`, {
    user_id: userId,
    fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count,username",
    limit: String(limit),
  });
  return res.data;
}

// ===========================================================================
// Mapping
// ===========================================================================

function extractHashtagsFromCaption(caption: string): string[] {
  const matches = caption.match(/#[\w]+/g);
  return matches ? Array.from(new Set(matches.map((h) => h.toLowerCase()))).slice(0, 12) : [];
}

function mapMediaToResult(m: HashtagMedia, sourceHashtag: string): ResearchResult {
  const likes = m.like_count ?? 0;
  const comments = m.comments_count ?? 0;
  const cleanCaption = (m.caption ?? "").replace(/\s+/g, " ").trim();
  const title = cleanCaption.slice(0, 200) || `Instagram ${m.media_type.toLowerCase().replace("_", " ")}`;
  const tagsFromCaption = extractHashtagsFromCaption(cleanCaption);
  const hashtags = tagsFromCaption.length > 0 ? tagsFromCaption : [`#${sourceHashtag}`];

  const formatMap: Record<HashtagMedia["media_type"], ResearchResult["content_format"]> = {
    VIDEO: "reel",
    IMAGE: "image",
    CAROUSEL_ALBUM: "carousel",
  };

  return {
    id: nanoid(10),
    platform: "instagram",
    url: m.permalink,
    title,
    creator: m.username ? `@${m.username}` : "(via hashtag search)",
    likes,
    comments,
    shares: 0,
    views: 0,
    engagement_score: computeEngagementScore({ likes, comments }),
    hashtags,
    topic: "beauty care",
    content_format: formatMap[m.media_type] ?? "image",
    raw: m,
    found_at: new Date().toISOString(),
  };
}

// ===========================================================================
// Public — research
// ===========================================================================

export async function searchBeautyReels(input: InstagramSearchInput): Promise<ResearchResult[]> {
  const limit = input.limit ?? 10;
  const provider = env.research.provider;

  if (provider === "apify" && env.apify.token) {
    log.info(`searching instagram (apify) niche="${input.niche}"`, { limit });
    try {
      const results = await apifyInstagramHashtagSearch(BEAUTY_HASHTAGS, limit);
      // Apify returns a flat list; sort+dedupe+slice to match the contract.
      const seen = new Set<string>();
      const deduped = results.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
      return deduped.sort((a, b) => b.engagement_score - a.engagement_score).slice(0, limit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("apify instagram search failed; falling back to mock", { err: msg });
      return mockSearchBeautyReels(input);
    }
  }

  if (provider === "graph" && env.social.instagramToken && env.social.instagramAccountId) {
    log.info(`searching instagram (graph api) niche="${input.niche}"`, { limit });
    try {
      return await realSearchBeautyReels(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("graph api instagram search failed; falling back to mock", { err: msg });
      return mockSearchBeautyReels(input);
    }
  }

  log.info(`searching instagram (mock) niche="${input.niche}"`, { limit });
  return mockSearchBeautyReels(input);
}

async function realSearchBeautyReels(input: InstagramSearchInput): Promise<ResearchResult[]> {
  const userId = env.social.instagramAccountId;
  if (!userId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID missing");
  const totalLimit = input.limit ?? 10;
  const tags = BEAUTY_HASHTAGS;
  const perTagLimit = Math.max(2, Math.ceil(totalLimit / tags.length));

  const results: ResearchResult[] = [];
  for (const tag of tags) {
    try {
      const hashtagId = await getHashtagId(tag, userId);
      const media = await getTopMedia(hashtagId, userId, perTagLimit);
      for (const m of media) results.push(mapMediaToResult(m, tag));
      log.debug(`#${tag}: ${media.length} posts`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`hashtag #${tag} failed`, { err: msg });
    }
  }

  // Dedupe by URL, then sort by engagement_score desc, then take topLimit.
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
  return deduped.sort((a, b) => b.engagement_score - a.engagement_score).slice(0, totalLimit);
}

// ===========================================================================
// Diagnostics
// ===========================================================================

/**
 * Verify token + account ID by interrogating Graph API.
 * Returns whatever it can discover, so the caller can guide the user toward
 * the right INSTAGRAM_BUSINESS_ACCOUNT_ID even when the configured one is wrong.
 */
export interface IgDiagnostic {
  /** What /me reports — the entity the token represents (Page, User, or App). */
  me?: { id: string; name?: string };
  /** The IG Business Account linked to /me, if any. THIS is what user_id should be. */
  igBusinessAccount?: { id: string; username?: string; name?: string };
  /** Pages this token can list (via /me/accounts), each with its linked IG account if any. */
  pages?: Array<{
    id: string;
    name: string;
    pageAccessToken?: string;
    igBusinessAccountId?: string;
    igUsername?: string;
  }>;
  /** Permission scopes granted to this token. */
  permissions?: string[];
  /** Whether the configured INSTAGRAM_BUSINESS_ACCOUNT_ID worked. */
  configuredAccountWorks: boolean;
  /** What's in .env right now. */
  configuredAccountId: string;
  /** Anything the diagnostic noticed that the user should know. */
  notes: string[];
}

export async function igTest(): Promise<IgDiagnostic> {
  const result: IgDiagnostic = {
    configuredAccountId: env.social.instagramAccountId,
    configuredAccountWorks: false,
    notes: [],
  };

  // Step 1: who is this token?
  try {
    const me = await ig<{ id: string; name?: string; instagram_business_account?: { id: string } }>("/me", {
      fields: "id,name,instagram_business_account",
    });
    result.me = { id: me.id, name: me.name };

    // If the token is a Page Access Token, /me returns the Page. The IG Business
    // Account is the linked instagram_business_account.id.
    if (me.instagram_business_account?.id) {
      const igId = me.instagram_business_account.id;
      try {
        const igProfile = await ig<{ id: string; username?: string; name?: string }>(`/${igId}`, {
          fields: "id,username,name",
        });
        result.igBusinessAccount = igProfile;
      } catch {
        result.igBusinessAccount = { id: igId };
      }
    }
  } catch (err) {
    result.notes.push(`/me failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: token permissions
  try {
    const perms = await ig<{ data: Array<{ permission: string; status: string }> }>("/me/permissions", {});
    result.permissions = perms.data.filter((p) => p.status === "granted").map((p) => p.permission);
  } catch {
    /* permissions endpoint not always available — non-fatal */
  }

  // Step 2.5: list pages this token can manage. Each Page has its own access
  // token + may have a linked Instagram Business Account (the value we want).
  try {
    const pagesRes = await ig<{
      data: Array<{
        id: string;
        name: string;
        access_token?: string;
        instagram_business_account?: { id: string };
      }>;
    }>("/me/accounts", { fields: "id,name,access_token,instagram_business_account" });

    if (pagesRes.data && pagesRes.data.length > 0) {
      result.pages = [];
      for (const p of pagesRes.data) {
        const entry: NonNullable<IgDiagnostic["pages"]>[number] = {
          id: p.id,
          name: p.name,
          pageAccessToken: p.access_token,
          igBusinessAccountId: p.instagram_business_account?.id,
        };
        // If linked, look up the IG username for friendlier display.
        if (entry.igBusinessAccountId && p.access_token) {
          try {
            const igProfile = await fetch(
              `${GRAPH_BASE}/${entry.igBusinessAccountId}?fields=username&access_token=${encodeURIComponent(
                p.access_token,
              )}`,
            );
            const igData = (await igProfile.json()) as { username?: string; error?: { message?: string } };
            if (igData.username) entry.igUsername = igData.username;
          } catch {
            /* non-fatal */
          }
        }
        result.pages.push(entry);
      }
    }
  } catch (err) {
    result.notes.push(`/me/accounts failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
  }

  // Step 3: does the configured INSTAGRAM_BUSINESS_ACCOUNT_ID actually work?
  if (result.configuredAccountId) {
    try {
      await ig(`/${result.configuredAccountId}`, { fields: "id" });
      result.configuredAccountWorks = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.notes.push(`Configured account ${result.configuredAccountId} not accessible: ${msg.slice(0, 200)}`);
    }
  }

  // Recommendation
  if (
    result.igBusinessAccount &&
    result.igBusinessAccount.id !== result.configuredAccountId
  ) {
    result.notes.push(
      `↪ Update INSTAGRAM_BUSINESS_ACCOUNT_ID in .env to: ${result.igBusinessAccount.id}` +
        (result.igBusinessAccount.username ? ` (@${result.igBusinessAccount.username})` : ""),
    );
  }

  return result;
}

// ===========================================================================
// Mocked fallback (kept identical to prior behaviour)
// ===========================================================================

const MOCK_REELS = [
  { title: "Tinted moisturizers for oily skin (ranked)", creator: "skin.daily" },
  { title: "I asked a derm about niacinamide myths", creator: "thedermlab" },
  { title: "Faceless 60-second nighttime skincare ASMR", creator: "minimalist.glow" },
  { title: "What I bought from Sephora vs what's actually worth it", creator: "beautycents" },
  { title: "Build a barrier-friendly routine for under $50", creator: "barrierfirst" },
  { title: "The retinol order I wish I knew at 25", creator: "agewithgrace.derm" },
  { title: "5 viral skincare combos that actually work", creator: "trend.skin" },
  { title: "How to fade post-acne marks (with proof)", creator: "clear.skin.club" },
  { title: "POV: budget glass skin in 4 steps", creator: "softglow.daily" },
  { title: "Sunscreen reapplication hacks for makeup wearers", creator: "sunsmart.beauty" },
];

function mockSearchBeautyReels(input: InstagramSearchInput): ResearchResult[] {
  const limit = Math.min(input.limit ?? 10, MOCK_REELS.length);
  const now = new Date().toISOString();
  return MOCK_REELS.slice(0, limit).map((m, i) => {
    const likes = 20_000 + Math.floor(Math.random() * 400_000);
    const comments = 200 + Math.floor(Math.random() * 6_000);
    const shares = 100 + Math.floor(Math.random() * 3_000);
    const views = likes * (4 + Math.floor(Math.random() * 10));
    const score = computeEngagementScore({ likes, comments, shares, views });
    return {
      id: nanoid(10),
      platform: "instagram",
      url: `https://www.instagram.com/reel/${nanoid(11)}/`,
      title: m.title,
      creator: m.creator,
      likes,
      comments,
      shares,
      views,
      engagement_score: score,
      hashtags: ["#beautycare", "#skincare", "#instabeauty", "#reels"],
      topic: "beauty care",
      content_format: "reel",
      raw: { source: "mock", index: i },
      found_at: now,
    };
  });
}

// ===========================================================================
// Publishing — still mocked. See file header for TODO.
// ===========================================================================

export type InstagramPublishPayload = TikTokPublishPayload;

export async function publishToInstagram(
  payload: InstagramPublishPayload,
  dryRun: boolean,
): Promise<PublishResult> {
  if (dryRun) {
    log.info("DRY_RUN — would publish to Instagram", { captionPreview: payload.caption.slice(0, 80) });
    return { ok: true, id: `mock_ig_${nanoid(8)}`, message: "dry-run accepted" };
  }
  log.warn("real Instagram publishing not implemented; treating as dry-run");
  return { ok: false, message: "Instagram publish not implemented" };
}
