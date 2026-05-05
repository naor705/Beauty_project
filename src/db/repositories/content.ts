import { nanoid } from "nanoid";
import { getDb } from "../client.js";
import type { ContentType, GeneratedContent } from "../../types/index.js";

type Row = {
  id: string;
  selected_trend_id: string;
  content_type: string;
  hook: string;
  caption: string;
  hashtags: string;
  cta: string;
  script: string | null;
  shot_list: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  voiceover_text: string | null;
  subtitles: string | null;
  visual_instructions: string | null;
  asset_url: string | null;
  generation_payload: string | null;
  created_at: string;
};

function toModel(r: Row): GeneratedContent {
  return {
    id: r.id,
    selected_trend_id: r.selected_trend_id,
    content_type: r.content_type as ContentType,
    hook: r.hook,
    caption: r.caption,
    hashtags: JSON.parse(r.hashtags) as string[],
    cta: r.cta,
    script: r.script,
    shot_list: r.shot_list ? (JSON.parse(r.shot_list) as string[]) : null,
    image_prompt: r.image_prompt,
    video_prompt: r.video_prompt,
    voiceover_text: r.voiceover_text,
    subtitles: r.subtitles,
    visual_instructions: r.visual_instructions,
    asset_url: r.asset_url,
    generation_payload: r.generation_payload ? JSON.parse(r.generation_payload) : null,
    created_at: r.created_at,
  };
}

export function createContent(input: Omit<GeneratedContent, "id" | "created_at">): GeneratedContent {
  const db = getDb();
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO generated_content (
      id, selected_trend_id, content_type, hook, caption, hashtags, cta,
      script, shot_list, image_prompt, video_prompt, voiceover_text,
      subtitles, visual_instructions, asset_url, generation_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.selected_trend_id,
    input.content_type,
    input.hook,
    input.caption,
    JSON.stringify(input.hashtags),
    input.cta,
    input.script,
    input.shot_list ? JSON.stringify(input.shot_list) : null,
    input.image_prompt,
    input.video_prompt,
    input.voiceover_text,
    input.subtitles,
    input.visual_instructions,
    input.asset_url,
    input.generation_payload ? JSON.stringify(input.generation_payload) : null,
  );

  const row = db.prepare("SELECT * FROM generated_content WHERE id = ?").get(id) as Row;
  return toModel(row);
}

export function getContent(id: string): GeneratedContent | null {
  const row = getDb().prepare("SELECT * FROM generated_content WHERE id = ?").get(id) as Row | undefined;
  return row ? toModel(row) : null;
}

export function updateAsset(id: string, assetUrl: string, payload: unknown): GeneratedContent | null {
  const db = getDb();
  db.prepare(
    "UPDATE generated_content SET asset_url = ?, generation_payload = ? WHERE id = ?",
  ).run(assetUrl, payload === undefined ? null : JSON.stringify(payload), id);
  return getContent(id);
}

export function listForSelection(selectedTrendId: string): GeneratedContent[] {
  const rows = getDb()
    .prepare("SELECT * FROM generated_content WHERE selected_trend_id = ? ORDER BY created_at DESC")
    .all(selectedTrendId) as Row[];
  return rows.map(toModel);
}
