/**
 * Video generation provider abstraction.
 *
 * Supports: creatomate (template-based), runway (gen-3), pika (T2V).
 *
 * TODO(real):
 *   - Creatomate: POST https://api.creatomate.com/v1/renders with template_id + modifications.
 *     Poll GET /renders/{id} until status === "succeeded". Returns mp4 URL.
 *   - Runway: POST https://api.runwayml.com/v1/image_to_video.
 *   - Pika: POST https://api.pika.art/generate (subject to availability).
 */
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import {
  createVideo,
  waitForVideo,
  buildAiStoryVideoInputs,
  splitVoiceoverIntoScenes,
} from "./blotato.js";

const log = createLogger("video-gen");

export interface FacelessVideoInput {
  kind: "faceless";
  script: string;
  scenes: string[];
  voiceoverText: string;
  subtitlesSrt?: string;
  visualInstructions?: string;
}

export interface GeneratedVideoInput {
  kind: "generated";
  prompt: string;
  durationSeconds?: number;
}

export type VideoGenInput = FacelessVideoInput | GeneratedVideoInput;

export interface VideoGenResult {
  url: string;
  provider: string;
  durationSeconds: number;
  payload: unknown;
}

export async function generateVideo(input: VideoGenInput): Promise<VideoGenResult> {
  const provider = env.video.provider;

  if (provider === "mock") {
    const url = `https://example.com/mock-video/${nanoid(10)}.mp4`;
    const duration = "durationSeconds" in input ? input.durationSeconds ?? 15 : 15;
    log.info("mock video generated", { kind: input.kind, duration });
    return { url, provider: "mock", durationSeconds: duration, payload: { mock: true, input } };
  }

  if (provider === "blotato") {
    return generateViaBlotato(input);
  }

  // TODO(real): wire creatomate/runway/pika
  if (provider === "creatomate") log.warn("creatomate not wired; returning mock");
  else if (provider === "runway") log.warn("runway not wired; returning mock");
  else if (provider === "pika") log.warn("pika not wired; returning mock");

  // Fall through to mock so the agent never crashes.
  const url = `https://example.com/mock-video/${nanoid(10)}.mp4`;
  const duration = "durationSeconds" in input ? input.durationSeconds ?? 15 : 15;
  return { url, provider, durationSeconds: duration, payload: { mock: true, input } };
}

async function generateViaBlotato(input: VideoGenInput): Promise<VideoGenResult> {
  // Strategy:
  //   - faceless + we have scene+voiceover data → pass structured `inputs`
  //     (deterministic; template fills from our exact script).
  //   - generated → free-text prompt (template auto-fills from natural language).
  //   - faceless without scene data → fall back to free-text prompt.
  let createPayload: { prompt?: string; inputs?: Record<string, unknown>; title: string };

  if (input.kind === "faceless" && input.scenes.length > 0) {
    // Blotato's AI Story Video template renders most reliably with 4-5 scenes,
    // and AI image prompts must stay under ~300 chars or generation often fails.
    const MAX_SCENES = 5;
    const MAX_MEDIA_PROMPT = 300;
    const MAX_SCRIPT = 200;
    const trimmed = input.scenes.map((s) => s.trim()).filter(Boolean).slice(0, MAX_SCENES);
    const scripts = splitVoiceoverIntoScenes(input.voiceoverText, trimmed.length);
    const sceneObjs = trimmed
      .map((mediaPrompt, i) => ({
        script: (scripts[i] ?? "").trim().slice(0, MAX_SCRIPT),
        mediaPrompt: mediaPrompt.slice(0, MAX_MEDIA_PROMPT),
      }))
      .filter((s) => s.script.length > 0 && s.mediaPrompt.length > 0);

    if (sceneObjs.length === 0) throw new Error("no usable scenes after filtering");

    const inputs = buildAiStoryVideoInputs({
      scenes: sceneObjs,
      aspectRatio: "9:16",
      captionPosition: "bottom",
      trimToVoiceover: true,
    });
    createPayload = { inputs, title: `beauty-${Date.now()}` };
    log.info("blotato faceless video — structured inputs", {
      sceneCount: sceneObjs.length,
      droppedFromInput: input.scenes.length - sceneObjs.length,
      payload: JSON.stringify(inputs).slice(0, 600),
    });
  } else {
    const prompt =
      input.kind === "faceless"
        ? [
            "Vertical 9:16 faceless beauty short.",
            input.visualInstructions,
            "Voiceover:",
            input.voiceoverText,
          ]
            .filter(Boolean)
            .join("\n")
        : input.prompt;
    createPayload = { prompt, title: `beauty-${Date.now()}` };
    log.info("blotato video — prompt mode", { kind: input.kind });
  }

  const created = await createVideo(createPayload);
  log.info(`blotato video ${created.item.id} queued (status=${created.item.status})`);

  const { mediaUrl } = await waitForVideo(created.item.id);
  const duration = "durationSeconds" in input ? input.durationSeconds ?? 15 : 15;
  return {
    url: mediaUrl,
    provider: "blotato",
    durationSeconds: duration,
    payload: { creationId: created.item.id, ...createPayload },
  };
}
