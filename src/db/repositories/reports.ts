import { nanoid } from "nanoid";
import { getDb } from "../client.js";
import type { TrendInsight, TrendReport } from "../../types/index.js";

type ReportRow = {
  id: string;
  generated_at: string;
  range_start: string;
  range_end: string;
  summary: string;
  top_result_ids: string;
};

type InsightRow = {
  id: string;
  report_id: string;
  result_id: string;
  rank: number;
  summary: string;
  why_it_works: string;
  hook: string;
  pain_point: string;
  product_angle: string;
  content_idea: string;
  recommended_format: string;
};

function toReport(r: ReportRow): TrendReport {
  return {
    id: r.id,
    generated_at: r.generated_at,
    range_start: r.range_start,
    range_end: r.range_end,
    summary: r.summary,
    top_result_ids: JSON.parse(r.top_result_ids) as string[],
  };
}

function toInsight(r: InsightRow): TrendInsight {
  return {
    result_id: r.result_id,
    rank: r.rank,
    summary: r.summary,
    why_it_works: r.why_it_works,
    hook: r.hook,
    pain_point: r.pain_point,
    product_angle: r.product_angle,
    content_idea: r.content_idea,
    recommended_format: r.recommended_format as TrendInsight["recommended_format"],
  };
}

export function createReport(input: {
  range_start: string;
  range_end: string;
  summary: string;
  top_result_ids: string[];
  insights: TrendInsight[];
}): TrendReport {
  const db = getDb();
  const reportId = nanoid(12);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO trend_reports (id, range_start, range_end, summary, top_result_ids)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(reportId, input.range_start, input.range_end, input.summary, JSON.stringify(input.top_result_ids));

    const insertInsight = db.prepare(`
      INSERT INTO trend_insights (
        id, report_id, result_id, rank, summary, why_it_works, hook,
        pain_point, product_angle, content_idea, recommended_format
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ins of input.insights) {
      insertInsight.run(
        nanoid(12),
        reportId,
        ins.result_id,
        ins.rank,
        ins.summary,
        ins.why_it_works,
        ins.hook,
        ins.pain_point,
        ins.product_angle,
        ins.content_idea,
        ins.recommended_format,
      );
    }
  });

  tx();
  const row = db.prepare("SELECT * FROM trend_reports WHERE id = ?").get(reportId) as ReportRow;
  return toReport(row);
}

export function getReport(id: string): TrendReport | null {
  const row = getDb().prepare("SELECT * FROM trend_reports WHERE id = ?").get(id) as ReportRow | undefined;
  return row ? toReport(row) : null;
}

export function listReports(limit = 20): TrendReport[] {
  const rows = getDb()
    .prepare("SELECT * FROM trend_reports ORDER BY generated_at DESC LIMIT ?")
    .all(limit) as ReportRow[];
  return rows.map(toReport);
}

export function latestReport(): TrendReport | null {
  const row = getDb()
    .prepare("SELECT * FROM trend_reports ORDER BY generated_at DESC LIMIT 1")
    .get() as ReportRow | undefined;
  return row ? toReport(row) : null;
}

export function listInsights(reportId: string): TrendInsight[] {
  const rows = getDb()
    .prepare("SELECT * FROM trend_insights WHERE report_id = ? ORDER BY rank ASC")
    .all(reportId) as InsightRow[];
  return rows.map(toInsight);
}
