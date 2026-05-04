/**
 * LLM provider abstraction. Default is "mock" so the MVP runs offline.
 * Swap to "anthropic" or "openai" by setting LLM_PROVIDER + the matching key.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("llm");

let _anthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (_anthropic) return _anthropic;
  if (!env.llm.anthropicKey) throw new Error("ANTHROPIC_API_KEY not set");
  _anthropic = new Anthropic({ apiKey: env.llm.anthropicKey });
  return _anthropic;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  system?: string;
  messages: LLMMessage[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  json?: unknown;
}

export async function callLLM(opts: LLMCallOptions): Promise<LLMResponse> {
  switch (env.llm.provider) {
    case "anthropic":
      return callAnthropic(opts);
    case "openai":
      return callOpenAI(opts);
    case "mock":
    default:
      return callMock(opts);
  }
}

// =============== Provider impls ===============

async function callAnthropic(opts: LLMCallOptions): Promise<LLMResponse> {
  if (!env.llm.anthropicKey) {
    log.warn("ANTHROPIC_API_KEY missing; falling back to mock");
    return callMock(opts);
  }

  const jsonInstruction = opts.json
    ? "\n\nRespond with a single valid JSON object. No markdown fences, no prose, no commentary — JSON only."
    : "";
  const system = `${opts.system ?? ""}${jsonInstruction}`.trim();

  try {
    const client = anthropicClient();
    const res = await client.messages.create({
      model: env.llm.anthropicModel,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      system: system || undefined,
      messages: opts.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });

    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    if (opts.json) {
      try {
        return { text, json: JSON.parse(stripJsonFences(text)) };
      } catch (err) {
        log.warn("anthropic returned non-JSON; falling back to mock for this call", {
          preview: text.slice(0, 120),
        });
        return callMock(opts);
      }
    }
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("anthropic call failed; falling back to mock", { err: msg });
    return callMock(opts);
  }
}

function stripJsonFences(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(text.trim());
  return fenced ? fenced[1]!.trim() : text.trim();
}

async function callOpenAI(_opts: LLMCallOptions): Promise<LLMResponse> {
  // TODO(real): import OpenAI from "openai"
  // const client = new OpenAI({ apiKey: env.llm.openaiKey });
  // const res = await client.chat.completions.create({...});
  log.warn("openai provider selected but SDK not wired; falling back to mock");
  return callMock(_opts);
}

/**
 * Deterministic mock LLM. Returns canned-shaped responses based on a
 * "intent tag" inside the system prompt. Agents pass `system: "intent:summarize"` etc.
 */
function callMock(opts: LLMCallOptions): Promise<LLMResponse> {
  const sys = opts.system ?? "";
  const userText = opts.messages.find((m) => m.role === "user")?.content ?? "";

  const intent = (/intent:(\w+)/.exec(sys)?.[1] ?? "default").toLowerCase();
  log.debug("mock LLM call", { intent, json: opts.json });

  if (intent === "trend_insight") {
    return Promise.resolve({
      text: "",
      json: {
        summary: "Short visual demo of overnight glass-skin routine using budget products.",
        why_it_works: "Pairs aspirational outcome with affordable stack; before/after hook lands in <2s.",
        hook: "POV: you wake up with glass skin",
        pain_point: "Viewers feel skincare is too expensive or complicated.",
        product_angle: "Reposition our hydrating serum as the 'budget-luxury' centerpiece.",
        content_idea: "Faceless overnight routine with text-on-screen showing each step + price.",
        recommended_format: "short_video",
      },
    });
  }

  if (intent === "report_summary") {
    return Promise.resolve({
      text:
        "Top 10 beauty-care trends this cycle skew toward overnight routines, " +
        "minimal-ingredient hauls, and dermatologist-style myth-busting. Faceless " +
        "POV videos with text overlays continue to dominate engagement.",
    });
  }

  if (intent === "content_pack") {
    return Promise.resolve({
      text: "",
      json: {
        hook: "Stop wasting money on 12-step routines.",
        caption:
          "3 products. 3 minutes. Glass skin. Save this for tonight 🌙\n\nWhat would you add to a minimalist routine?",
        hashtags: ["#beautycare", "#glassskin", "#skincareroutine", "#minimalistskincare", "#beautytips"],
        cta: "Comment GLOW and I'll DM you the exact product list.",
        script:
          "Scene 1 (0-2s): Hook overlay 'Stop wasting money on 12-step routines.' over close-up of cluttered shelf.\n" +
          "Scene 2 (2-6s): Hand reaches in and removes everything except 3 products.\n" +
          "Scene 3 (6-12s): Apply each product with text-on-screen explaining the why.\n" +
          "Scene 4 (12-15s): Final glass-skin reveal with CTA overlay.",
        shot_list: [
          "Top-down shot of cluttered bathroom shelf",
          "Hand sweeping bottles aside, leaving 3",
          "Close-up application of cleanser",
          "Close-up application of hydrating serum",
          "Close-up application of moisturizer",
          "Final glass-skin selfie or product hero shot",
        ],
        image_prompt:
          "Editorial flat-lay of three minimalist beauty products on a soft beige background, " +
          "morning light, hyperreal, 50mm, shallow depth of field",
        video_prompt:
          "15-second vertical 9:16 faceless beauty short. Hands-only product application. " +
          "Soft warm lighting. Text overlays in clean sans-serif. Calm lo-fi background.",
        voiceover_text:
          "You don't need 12 products. You need 3. Cleanse. Hydrate. Lock it in. That's it.",
        subtitles:
          "1\n00:00:00,000 --> 00:00:02,000\nYou don't need 12 products.\n\n" +
          "2\n00:00:02,000 --> 00:00:04,500\nYou need 3.\n\n" +
          "3\n00:00:04,500 --> 00:00:08,000\nCleanse. Hydrate. Lock it in.\n\n" +
          "4\n00:00:08,000 --> 00:00:10,000\nThat's it.",
        visual_instructions:
          "Camera static on tripod. Hands-only. Soft window light from camera left. " +
          "Subtle product highlight via white reflector. No faces.",
      },
    });
  }

  return Promise.resolve({
    text: `[mock LLM] received ${userText.length} chars, intent=${intent}`,
  });
}
