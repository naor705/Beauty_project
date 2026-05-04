import { nanoid } from "nanoid";
import { getDb } from "../client.js";
import type { ContentType, PublishPlatform, SelectedTrend } from "../../types/index.js";

type Row = {
  id: string;
  report_id: string;
  result_id: string;
  selected_at: string;
  content_type: string;
  target_platform: string;
  publish_at: string | null;
  notes: string | null;
};

function toModel(r: Row): SelectedTrend {
  return {
    id: r.id,
    report_id: r.report_id,
    result_id: r.result_id,
    selected_at: r.selected_at,
    content_type: r.content_type as ContentType,
    target_platform: r.target_platform as PublishPlatform,
    publish_at: r.publish_at,
    notes: r.notes,
  };
}

export function createSelection(input: {
  report_id: string;
  result_id: string;
  content_type: ContentType;
  target_platform: PublishPlatform;
  publish_at?: string | null;
  notes?: string | null;
}): SelectedTrend {
  const db = getDb();
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO selected_trends (id, report_id, result_id, content_type, target_platform, publish_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.report_id,
    input.result_id,
    input.content_type,
    input.target_platform,
    input.publish_at ?? null,
    input.notes ?? null,
  );
  const row = db.prepare("SELECT * FROM selected_trends WHERE id = ?").get(id) as Row;
  return toModel(row);
}

export function getSelection(id: string): SelectedTrend | null {
  const row = getDb().prepare("SELECT * FROM selected_trends WHERE id = ?").get(id) as Row | undefined;
  return row ? toModel(row) : null;
}

export function listSelections(limit = 50): SelectedTrend[] {
  const rows = getDb()
    .prepare("SELECT * FROM selected_trends ORDER BY selected_at DESC LIMIT ?")
    .all(limit) as Row[];
  return rows.map(toModel);
}
