import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { rankByEngagement } from "../utils/engagement.js";
import { searchBeautyTrends } from "../integrations/tiktok.js";
import { searchBeautyReels } from "../integrations/instagram.js";
import { searchYouTubeShorts, searchRedditBeauty } from "../integrations/optional-sources.js";
import { upsertResult } from "../db/repositories/research.js";
import type { ResearchResult } from "../types/index.js";

const log = createLogger("agent:research");

export interface ResearchAgentOptions {
  niche?: string;
  perSource?: number;
  includeOptional?: boolean;
}

/**
 * Daily research job. Fans out to TikTok + Instagram (and optional sources),
 * normalizes results, ranks by engagement, persists, and returns the run summary.
 */
export async function runResearchJob(options: ResearchAgentOptions = {}): Promise<{
  total: number;
  saved: number;
  topSample: ResearchResult[];
}> {
  const niche = options.niche ?? env.niche;
  const perSource = options.perSource ?? 10;
  const includeOptional = options.includeOptional ?? false;

  log.info(`starting research run`, { niche, perSource, includeOptional });

  const tasks: Promise<ResearchResult[]>[] = [
    searchBeautyTrends({ niche, limit: perSource }),
    searchBeautyReels({ niche, limit: perSource }),
  ];
  if (includeOptional) {
    tasks.push(searchYouTubeShorts(niche, perSource));
    tasks.push(searchRedditBeauty(niche, perSource));
  }

  const buckets = await Promise.all(tasks);
  const all = buckets.flat();
  log.info(`fetched ${all.length} raw results across ${buckets.length} sources`);

  let saved = 0;
  for (const item of all) {
    upsertResult(item);
    saved++;
  }

  const top = rankByEngagement(all).slice(0, 5);
  log.info(`research run complete`, { saved, top: top.map((t) => t.title) });
  return { total: all.length, saved, topSample: top };
}
