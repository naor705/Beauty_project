import { createLogger } from "../utils/logger.js";
import { callLLM } from "../integrations/llm.js";
import { generateImage } from "../integrations/image-gen.js";
import { generateVideo } from "../integrations/video-gen.js";
import { findById as findResult } from "../db/repositories/research.js";
import { listInsights } from "../db/repositories/reports.js";
import { getSelection } from "../db/repositories/selections.js";
import { createContent, updateAsset } from "../db/repositories/content.js";
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
      "Never copy phrasing from the source. " +
      "Output ONLY a single flat JSON object with EXACTLY these keys at the TOP level (no wrapper): " +
      "hook (string, the opening attention-grabber, max 80 chars), " +
      "caption (string, the post body, may include line breaks), " +
      "hashtags (array of 5-8 strings, each starting with #), " +
      "cta (string, one-sentence call to action), " +
      "script (string, full multi-scene script with scene timings), " +
      "shot_list (array of 4-8 short shot description strings), " +
      "image_prompt (string, detailed prompt for an image generator), " +
      "video_prompt (string, detailed prompt for a video generator), " +
      "voiceover_text (string, the words to be spoken, conversational tone), " +
      "subtitles (string, SRT-formatted captions), " +
      "visual_instructions (string, camera/lighting/composition notes). " +
      "Output valid JSON only — no markdown fences, no commentary.",
    json: true,
    maxTokens: 4096,
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

  // Save the LLM-generated content row first so a video-render failure doesn't
  // throw away Claude's output. We update asset_url after a successful render.
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
    asset_url: null,
    generation_payload: null,
  });
  log.info(`saved content ${saved.id} (${saved.content_type}) — rendering asset...`);

  let assetUrl: string | null = null;
  let payload: unknown = null;

  try {
    if (selection.content_type === "image") {
      const img = await generateImage({
        prompt: pack.image_prompt ?? "minimalist beauty product flat-lay",
      });
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
  } catch (err) {
    log.error(`asset render failed for content ${saved.id}; row preserved with null asset_url`, {
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (assetUrl) updateAsset(saved.id, assetUrl, payload);
  log.info(`content ${saved.id} done (asset=${assetUrl ?? "none"})`);
  return updateAsset(saved.id, assetUrl ?? "", payload) ?? saved;
}
