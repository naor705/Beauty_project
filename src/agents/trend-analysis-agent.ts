import { createLogger } from "../utils/logger.js";
import { callLLM } from "../integrations/llm.js";
import { listSince } from "../db/repositories/research.js";
import { createReport } from "../db/repositories/reports.js";
import { rankByEngagement } from "../utils/engagement.js";
import type { ContentFormat, ResearchResult, TrendInsight, TrendReport } from "../types/index.js";

const log = createLogger("agent:trend-analysis");

export interface TrendAnalysisOptions {
  windowDays?: number;
  topN?: number;
}

interface RawInsight {
  summary: string;
  why_it_works: string;
  hook: string;
  pain_point: string;
  product_angle: string;
  content_idea: string;
  recommended_format: ContentFormat;
}

const FORMAT_FALLBACK: Record<ResearchResult["content_format"], ContentFormat> = {
  short_video: "short_video",
  reel: "reel",
  image: "image",
  carousel: "carousel",
  text: "short_video",
};

async function summarizeOne(result: ResearchResult): Promise<RawInsight> {
  const res = await callLLM({
    system:
      "intent:trend_insight You analyze beauty-care social trends. " +
      "Output ONLY a single flat JSON object with EXACTLY these keys at the TOP level (no wrapper, no nesting): " +
      "summary (string, 1-2 sentences), " +
      "why_it_works (string, 1-2 sentences), " +
      "hook (string, the opening line that earns attention), " +
      "pain_point (string, the audience need this addresses), " +
      "product_angle (string, how a beauty-care brand could repurpose this), " +
      "content_idea (string, our original content concept inspired by this trend), " +
      "recommended_format (one of: short_video, reel, image, carousel, text). " +
      "Do NOT wrap your response in any outer key. Output valid JSON only.",
    json: true,
    maxTokens: 2048,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          platform: result.platform,
          title: result.title,
          creator: result.creator,
          metrics: {
            likes: result.likes,
            comments: result.comments,
            shares: result.shares,
            views: result.views,
            engagement_score: result.engagement_score,
          },
          hashtags: result.hashtags,
          format: result.content_format,
        }),
      },
    ],
  });

  const json = (res.json ?? {}) as Partial<RawInsight>;
  return {
    summary: json.summary ?? `Trend: ${result.title}`,
    why_it_works: json.why_it_works ?? "High engagement on a relatable beauty hook.",
    hook: json.hook ?? result.title,
    pain_point: json.pain_point ?? "Unclear or overwhelming skincare choices.",
    product_angle: json.product_angle ?? "Position our product as a clear, simple choice.",
    content_idea: json.content_idea ?? "Adapt the hook with our brand voice.",
    recommended_format: (json.recommended_format as ContentFormat) ?? FORMAT_FALLBACK[result.content_format],
  };
}

async function summarizeReport(top: ResearchResult[]): Promise<string> {
  const res = await callLLM({
    system: "intent:report_summary Write a 3-sentence executive summary for a content team.",
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          top.map((r) => ({ title: r.title, platform: r.platform, score: r.engagement_score })),
        ),
      },
    ],
  });
  return res.text;
}

/**
 * Builds a 3-day trend report. Picks top-N by engagement, generates per-trend insights,
 * an executive summary, and persists everything in trend_reports + trend_insights.
 */
export async function runTrendAnalysisJob(options: TrendAnalysisOptions = {}): Promise<TrendReport> {
  const windowDays = options.windowDays ?? 3;
  const topN = options.topN ?? 10;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const candidates = listSince(since, 1000);
  log.info(`analyzing ${candidates.length} results from last ${windowDays}d`);

  if (candidates.length === 0) {
    log.warn("no research results in window — running an empty report");
  }

  const top = rankByEngagement(candidates).slice(0, topN);

  const insights: TrendInsight[] = [];
  for (let i = 0; i < top.length; i++) {
    const r = top[i]!;
    const ins = await summarizeOne(r);
    insights.push({
      result_id: r.id,
      rank: i + 1,
      summary: ins.summary,
      why_it_works: ins.why_it_works,
      hook: ins.hook,
      pain_point: ins.pain_point,
      product_angle: ins.product_angle,
      content_idea: ins.content_idea,
      recommended_format: ins.recommended_format,
    });
  }

  const summary = top.length > 0 ? await summarizeReport(top) : "No trends in window.";
  const report = createReport({
    range_start: since,
    range_end: new Date().toISOString(),
    summary,
    top_result_ids: top.map((t) => t.id),
    insights,
  });

  log.info(`report ${report.id} created with ${insights.length} insights`);
  return report;
}
