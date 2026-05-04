import { createLogger } from "../utils/logger.js";
import { callLLM } from "../integrations/llm.js";
import { generateImage } from "../integrations/image-gen.js";
import { generateVideo } from "../integrations/video-gen.js";
import { findById as findResult } from "../db/repositories/research.js";
import { listInsights } from "../db/repositories/reports.js";
import { getSelection } from "../db/repositories/selections.js";
import { createContent } from "../db/repositories/content.js";
import type { ContentType, GeneratedContent, TrendInsight } from "../types/index.js";

const log = createLogger("agent:content");

interface ContentPack {
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  script?: string;
  shot_list?: string[];
  image_prompt?: string;
  video_prompt?: string;
  voiceover_text?: string;
  subtitles?: string;
  visual_instructions?: string;
}

async function generateContentPack(input: {
  contentType: ContentType;
  insight: TrendInsight | null;
  resultTitle: string;
  resultHashtags: string[];
}): Promise<ContentPack> {
  const res = await callLLM({
    system:
      "intent:content_pack You create ORIGINAL content inspired by a trend. " +
      "Never copy phrasing from the source. Output strict JSON with the keys: " +
      "hook, caption, hashtags, cta, script, shot_list, image_prompt, video_prompt, " +
      "voiceover_text, subtitles, visual_instructions.",
    json: true,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          content_type: input.contentType,
          trend_title: input.resultTitle,
          insight: input.insight,
          inspirational_hashtags: input.resultHashtags,
        }),
      },
    ],
  });

  const json = (res.json ?? {}) as Partial<ContentPack>;
  return {
    hook: json.hook ?? "Default hook",
    caption: json.caption ?? "Default caption",
    hashtags: Array.isArray(json.hashtags) && json.hashtags.length > 0 ? json.hashtags : ["#beautycare"],
    cta: json.cta ?? "Follow for more.",
    script: json.script,
    shot_list: json.shot_list,
    image_prompt: json.image_prompt,
    video_prompt: json.video_prompt,
    voiceover_text: json.voiceover_text,
    subtitles: json.subtitles,
    visual_instructions: json.visual_instructions,
  };
}

/**
 * Generates one content artifact for a previously-selected trend.
 * - image          → image prompt + caption + hashtags + image asset URL
 * - caption_post   → caption + hashtags + cta
 * - faceless_video → script + scenes + voiceover + subtitles + video render
 * - generated_video→ T2V prompt + video render
 */
export async function runContentGeneration(input: {
  selectedTrendId: string;
}): Promise<GeneratedContent> {
  const selection = getSelection(input.selectedTrendId);
  if (!selection) throw new Error(`selection not found: ${input.selectedTrendId}`);

  const result = findResult(selection.result_id);
  if (!result) throw new Error(`research result not found: ${selection.result_id}`);

  const insight =
    listInsights(selection.report_id).find((i) => i.result_id === selection.result_id) ?? null;

  log.info(`generating content`, {
    selectedTrendId: selection.id,
    contentType: selection.content_type,
    resultTitle: result.title,
  });

  const pack = await generateContentPack({
    contentType: selection.content_type,
    insight,
    resultTitle: result.title,
    resultHashtags: result.hashtags,
  });

  let assetUrl: string | null = null;
  let payload: unknown = null;

  if (selection.content_type === "image") {
    const img = await generateImage({ prompt: pack.image_prompt ?? "minimalist beauty product flat-lay" });
    assetUrl = img.url;
    payload = img.payload;
  } else if (selection.content_type === "faceless_video") {
    const vid = await generateVideo({
      kind: "faceless",
      script: pack.script ?? "",
      scenes: pack.shot_list ?? [],
      voiceoverText: pack.voiceover_text ?? "",
      subtitlesSrt: pack.subtitles,
      visualInstructions: pack.visual_instructions,
    });
    assetUrl = vid.url;
    payload = vid.payload;
  } else if (selection.content_type === "generated_video") {
    const vid = await generateVideo({
      kind: "generated",
      prompt: pack.video_prompt ?? "vertical beauty short, 9:16, soft lighting, no faces",
      durationSeconds: 15,
    });
    assetUrl = vid.url;
    payload = vid.payload;
  }
  // caption_post needs no asset

  const saved = createContent({
    selected_trend_id: selection.id,
    content_type: selection.content_type,
    hook: pack.hook,
    caption: pack.caption,
    hashtags: pack.hashtags,
    cta: pack.cta,
    script: pack.script ?? null,
    shot_list: pack.shot_list ?? null,
    image_prompt: pack.image_prompt ?? null,
    video_prompt: pack.video_prompt ?? null,
    voiceover_text: pack.voiceover_text ?? null,
    subtitles: pack.subtitles ?? null,
    visual_instructions: pack.visual_instructions ?? null,
    asset_url: assetUrl,
    generation_payload: payload,
  });

  log.info(`generated content ${saved.id} (${saved.content_type})`);
  return saved;
}
