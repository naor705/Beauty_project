/**
 * TikTok integration — research + publishing placeholders.
 *
 * TODO(real): TikTok Research API requires approval (research scope).
 *   - Apply: https://developers.tiktok.com/products/research-api
 *   - For publishing, use TikTok Content Posting API (Direct Post or Inbox).
 *   - Auth: OAuth 2.0 with content.posting.write scope.
 *
 * Until approved we generate plausible synthetic results so downstream agents
 * can be tested end-to-end. Mock data shape mirrors the real API where reasonable.
 */
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { computeEngagementScore } from "../utils/engagement.js";
import { createLogger } from "../utils/logger.js";
import { apifyTiktokHashtagSearch } from "./apify.js";
import type { ContentFormat, ResearchResult } from "../types/index.js";

const log = createLogger("tiktok");

const BEAUTY_HASHTAGS = ["skincare", "beautycare", "skincareroutine", "glassskin", "beautytips"];

export interface TikTokSearchInput {
  niche: string;
  limit?: number;
}

const MOCK_TITLES = [
  "POV: my overnight glass skin routine using only 3 products",
  "I tried the viral $7 serum dupe for 14 days — results",
  "Things I stopped doing once my skincare actually started working",
  "Dermatologist reacts: the SPF mistake everyone is making",
  "Faceless GRWM: 5-min minimalist makeup for oily skin",
  "Why your moisturizer might be the reason you're breaking out",
  "Reading viral skincare claims so you don't have to",
  "$0 vs $300 skincare: what actually matters",
  "The 3 retinol mistakes ruining your barrier",
  "Build your skincare shelf in under $40 — beginner edition",
];

const MOCK_HASHTAGS = [
  ["#glassskin", "#skincareroutine", "#beautycare", "#fyp"],
  ["#serum", "#dupe", "#beautytips", "#skincaretok"],
  ["#skincaremistakes", "#barrierrepair", "#beautycare"],
  ["#dermatologist", "#spf", "#sunscreen", "#beautycare"],
  ["#grwm", "#minimalistmakeup", "#oilyskin"],
  ["#moisturizer", "#breakouts", "#skincareadvice"],
  ["#viralskincare", "#reactvideo", "#beautycare"],
  ["#highvslow", "#skincare", "#beautycare"],
  ["#retinol", "#skincaretips", "#beautycare"],
  ["#beginnerskincare", "#budgetbeauty", "#beautycare"],
];

export async function searchBeautyTrends(input: TikTokSearchInput): Promise<ResearchResult[]> {
  const limit = input.limit ?? 10;

  if (env.research.provider === "apify" && env.apify.token) {
    log.info(`searching tiktok (apify) niche="${input.niche}"`, { limit });
    try {
      const results = await apifyTiktokHashtagSearch(BEAUTY_HASHTAGS, limit);
      const seen = new Set<string>();
      const deduped = results.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
      return deduped.sort((a, b) => b.engagement_score - a.engagement_score).slice(0, limit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("apify tiktok search failed; falling back to mock", { err: msg });
    }
  }

  log.info(`searching tiktok (mock) niche="${input.niche}"`, { limit });
  return mockSearchBeautyTrends(input);
}

function mockSearchBeautyTrends(input: TikTokSearchInput): ResearchResult[] {
  const limit = Math.min(input.limit ?? 10, MOCK_TITLES.length);
  const now = new Date().toISOString();

  return MOCK_TITLES.slice(0, limit).map((title, i) => {
    const likes = 50_000 + Math.floor(Math.random() * 800_000);
    const comments = 500 + Math.floor(Math.random() * 12_000);
    const shares = 200 + Math.floor(Math.random() * 8_000);
    const views = likes * (5 + Math.floor(Math.random() * 12));
    const score = computeEngagementScore({ likes, comments, shares, views });
    const id = nanoid(10);
    const tags: ContentFormat = "short_video";
    return {
      id,
      platform: "tiktok",
      url: `https://www.tiktok.com/@beauty_creator_${i}/video/${1_700_000_000_000 + i}`,
      title,
      creator: `beauty_creator_${i}`,
      likes,
      comments,
      shares,
      views,
      engagement_score: score,
      hashtags: MOCK_HASHTAGS[i] ?? ["#beautycare"],
      topic: "beauty care",
      content_format: tags,
      raw: { source: "mock", index: i },
      found_at: now,
    };
  });
}

// ===================== Publishing =====================

export interface TikTokPublishPayload {
  caption: string;
  hashtags: string[];
  videoUrl?: string;
  imageUrl?: string;
}

export interface PublishResult {
  ok: boolean;
  id?: string;
  message: string;
}

export async function publishToTikTok(payload: TikTokPublishPayload, dryRun: boolean): Promise<PublishResult> {
  if (dryRun) {
    log.info("DRY_RUN — would publish to TikTok", { captionPreview: payload.caption.slice(0, 80) });
    return { ok: true, id: `mock_tt_${nanoid(8)}`, message: "dry-run accepted" };
  }
  // TODO(real): TikTok Content Posting API
  // POST https://open.tiktokapis.com/v2/post/publish/video/init/
  // Auth: Bearer OAuth token with video.publish scope.
  // Implement a polling check on publish_id until status === PUBLISH_COMPLETE.
  log.warn("real TikTok publishing not implemented; treating as dry-run");
  return { ok: false, message: "TikTok publish not implemented" };
}
