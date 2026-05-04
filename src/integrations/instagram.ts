/**
 * Instagram integration — research (Graph API for owned content / hashtag search)
 * and publishing (Graph API container -> publish).
 *
 * TODO(real): Instagram Graph API
 *   - Auth: Long-lived Page Access Token tied to a Business or Creator account.
 *   - Hashtag Search: GET /ig_hashtag_search?user_id=...&q=skincare
 *     then GET /{ig-hashtag-id}/recent_media or /top_media.
 *   - Posting:
 *     1) POST /{ig-user-id}/media (image_url|video_url, caption)
 *     2) POST /{ig-user-id}/media_publish?creation_id=...
 *   - Reels require media_type=REELS + share_to_feed=true.
 */
import { nanoid } from "nanoid";
import { computeEngagementScore } from "../utils/engagement.js";
import { createLogger } from "../utils/logger.js";
import type { ResearchResult } from "../types/index.js";
import type { PublishResult, TikTokPublishPayload } from "./tiktok.js";

const log = createLogger("instagram");

export interface InstagramSearchInput {
  niche: string;
  limit?: number;
}

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

export async function searchBeautyReels(input: InstagramSearchInput): Promise<ResearchResult[]> {
  log.info(`searching instagram reels niche="${input.niche}"`, { limit: input.limit ?? 10 });
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

// ===================== Publishing =====================

export type InstagramPublishPayload = TikTokPublishPayload;

export async function publishToInstagram(
  payload: InstagramPublishPayload,
  dryRun: boolean,
): Promise<PublishResult> {
  if (dryRun) {
    log.info("DRY_RUN — would publish to Instagram", { captionPreview: payload.caption.slice(0, 80) });
    return { ok: true, id: `mock_ig_${nanoid(8)}`, message: "dry-run accepted" };
  }
  // TODO(real): Instagram Graph API
  // 1) container = POST /{ig-user-id}/media { media_type: REELS, video_url, caption, share_to_feed: true }
  // 2) poll GET /{container-id}?fields=status_code  until FINISHED
  // 3) POST /{ig-user-id}/media_publish { creation_id: container.id }
  log.warn("real Instagram publishing not implemented; treating as dry-run");
  return { ok: false, message: "Instagram publish not implemented" };
}
