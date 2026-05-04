import type { ResearchResult } from "../types/index.js";

/**
 * Engagement score is a weighted sum normalized into a single comparable number.
 * Weights bias toward shares (highest intent signal), then comments, then likes,
 * with views as a denominator-free reach multiplier so reach amplifies but does
 * not dominate. Adjust weights here as performance data accumulates.
 */
export function computeEngagementScore(input: {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
}): number {
  const likes = input.likes ?? 0;
  const comments = input.comments ?? 0;
  const shares = input.shares ?? 0;
  const views = input.views ?? 0;

  const interactions = likes * 1 + comments * 3 + shares * 5;
  const reachBoost = Math.log10(Math.max(views, 1)) * 50;
  return Math.round(interactions + reachBoost);
}

export function rankByEngagement<T extends Pick<ResearchResult, "engagement_score">>(items: T[]): T[] {
  return [...items].sort((a, b) => b.engagement_score - a.engagement_score);
}
