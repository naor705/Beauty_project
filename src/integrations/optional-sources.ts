/**
 * Optional research sources: YouTube Shorts, Reddit, Google Trends.
 * Stubbed for MVP — return empty arrays when no key is set, mock when explicitly invoked.
 *
 * TODO(real):
 *   - YouTube Data API v3 search.list?type=video&videoDuration=short&q=skincare
 *   - Reddit /r/SkincareAddiction/top.json?t=day  (oauth via reddit app for higher limits)
 *   - Google Trends: use serpapi or trends-js. Plain trends.google.com has no public API.
 */
import { nanoid } from "nanoid";
import { computeEngagementScore } from "../utils/engagement.js";
import { createLogger } from "../utils/logger.js";
import type { ResearchResult } from "../types/index.js";

const log = createLogger("optional-sources");

export async function searchYouTubeShorts(niche: string, limit = 5): Promise<ResearchResult[]> {
  log.debug(`youtube shorts (mock) niche="${niche}"`);
  const now = new Date().toISOString();
  return Array.from({ length: limit }, (_, i) => {
    const likes = 5_000 + Math.floor(Math.random() * 60_000);
    const comments = 100 + Math.floor(Math.random() * 1_500);
    const views = likes * (8 + Math.floor(Math.random() * 15));
    return {
      id: nanoid(10),
      platform: "youtube" as const,
      url: `https://youtube.com/shorts/${nanoid(11)}`,
      title: `Beauty short #${i + 1}: viral ${niche} tip`,
      creator: `yt_creator_${i}`,
      likes,
      comments,
      shares: 0,
      views,
      engagement_score: computeEngagementScore({ likes, comments, views }),
      hashtags: ["#shorts", "#beauty", "#skincare"],
      topic: niche,
      content_format: "short_video" as const,
      raw: { source: "mock-youtube", index: i },
      found_at: now,
    };
  });
}

export async function searchRedditBeauty(niche: string, limit = 5): Promise<ResearchResult[]> {
  log.debug(`reddit (mock) niche="${niche}"`);
  const now = new Date().toISOString();
  return Array.from({ length: limit }, (_, i) => {
    const likes = 500 + Math.floor(Math.random() * 8_000);
    const comments = 50 + Math.floor(Math.random() * 600);
    return {
      id: nanoid(10),
      platform: "reddit" as const,
      url: `https://reddit.com/r/SkincareAddiction/comments/${nanoid(7)}`,
      title: `Reddit thread #${i + 1}: ${niche} routine breakdown`,
      creator: `u/redditor_${i}`,
      likes,
      comments,
      shares: 0,
      views: 0,
      engagement_score: computeEngagementScore({ likes, comments }),
      hashtags: [],
      topic: niche,
      content_format: "text" as const,
      raw: { source: "mock-reddit", index: i },
      found_at: now,
    };
  });
}
