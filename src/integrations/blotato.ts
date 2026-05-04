/**
 * Blotato integration — generation + multi-platform publishing.
 *
 * Endpoints used (base = BLOTATO_BASE_URL, default https://backend.blotato.com/v2):
 *   POST /media                  — register a public media URL with Blotato CDN
 *   POST /videos/from-templates  — create a video from a template (returns id)
 *   GET  /videos/creations/:id   — poll until status === "done", returns mediaUrl
 *   POST /posts                  — schedule or publish a post (returns postSubmissionId)
 *
 * Auth header: blotato-api-key: <key>
 * Rate limit: 30 req/min per user.
 */
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("blotato");

class BlotatoError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "BlotatoError";
  }
}

async function blotato<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!env.blotato.apiKey) throw new BlotatoError("BLOTATO_API_KEY not set");
  const url = `${env.blotato.baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "blotato-api-key": env.blotato.apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // leave parsed null
  }
  if (!res.ok) {
    throw new BlotatoError(
      `blotato ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      parsed,
    );
  }
  return parsed as T;
}

// ===========================================================================
// Media upload — registers an external URL (or base64 data URL) with Blotato.
// ===========================================================================

export interface UploadMediaResult {
  url: string;
}

export async function uploadMedia(input: { url: string }): Promise<UploadMediaResult> {
  log.info("upload media", { url: input.url.slice(0, 80) });
  return blotato<UploadMediaResult>("POST", "/media", { url: input.url });
}

// ===========================================================================
// Template discovery.
// ===========================================================================

export interface VideoTemplate {
  id: string;
  title?: string;
  description?: string;
  inputs?: Record<string, unknown>;
}

export interface ListTemplatesResponse {
  items: VideoTemplate[];
}

export interface ListTemplatesQuery {
  fields?: string; // e.g. "id,title,description,inputs"
  search?: string;
  id?: string;
}

export async function listTemplates(query: ListTemplatesQuery = {}): Promise<ListTemplatesResponse> {
  const params = new URLSearchParams();
  if (query.fields) params.set("fields", query.fields);
  if (query.search) params.set("search", query.search);
  if (query.id) params.set("id", query.id);
  const qs = params.toString();
  return blotato<ListTemplatesResponse>("GET", `/videos/templates${qs ? `?${qs}` : ""}`);
}

export async function getTemplate(id: string): Promise<VideoTemplate | null> {
  const res = await listTemplates({ id, fields: "id,title,description,inputs" });
  return res.items[0] ?? null;
}

// ===========================================================================
// Video creation from template.
// ===========================================================================

export interface CreateVideoInput {
  templateId?: string;
  inputs?: Record<string, unknown>;
  prompt?: string;
  title?: string;
  useBrandKit?: boolean;
  isDraft?: boolean;
}

export interface CreateVideoResponse {
  item: { id: string; status: string };
}

export interface VideoCreationStatus {
  item: {
    id: string;
    status:
      | "queueing"
      | "generating-script"
      | "script-ready"
      | "generating-media"
      | "media-ready"
      | "exporting"
      | "done"
      | "failed";
    mediaUrl?: string;
    imageUrls?: string[];
    error?: { message?: string };
  };
}

export async function createVideo(input: CreateVideoInput): Promise<CreateVideoResponse> {
  const templateId = input.templateId ?? env.blotato.defaultVideoTemplateId;
  if (!templateId) throw new BlotatoError("templateId required (set BLOTATO_DEFAULT_VIDEO_TEMPLATE_ID)");
  return blotato<CreateVideoResponse>("POST", "/videos/from-templates", {
    templateId,
    inputs: input.inputs ?? {},
    prompt: input.prompt,
    title: input.title,
    useBrandKit: input.useBrandKit ?? true,
    isDraft: input.isDraft ?? false,
    render: true,
  });
}

export async function getVideoCreation(id: string): Promise<VideoCreationStatus> {
  return blotato<VideoCreationStatus>("GET", `/videos/creations/${id}`);
}

/**
 * Polls a creation until status === "done" (or fails / times out). Default timeout 5 min.
 */
export async function waitForVideo(
  id: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ mediaUrl: string }> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 4_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getVideoCreation(id);
    log.debug(`video ${id} -> ${status.item.status}`);
    if (status.item.status === "done") {
      if (!status.item.mediaUrl) throw new BlotatoError(`video ${id} done but no mediaUrl`);
      return { mediaUrl: status.item.mediaUrl };
    }
    if (status.item.status === "failed") {
      throw new BlotatoError(`video ${id} failed: ${status.item.error?.message ?? "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new BlotatoError(`video ${id} polling timeout after ${timeoutMs}ms`);
}

// ===========================================================================
// Publishing.
// ===========================================================================

export type BlotatoPlatform =
  | "twitter"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "pinterest"
  | "tiktok"
  | "threads"
  | "bluesky"
  | "youtube"
  | "other";

export interface InstagramTarget {
  targetType: "instagram";
  mediaType?: "reel" | "story";
  altText?: string;
  collaborators?: string[];
  coverImageUrl?: string;
  shareToFeed?: boolean;
}

export interface TikTokTarget {
  targetType: "tiktok";
  privacyLevel:
    | "SELF_ONLY"
    | "PUBLIC_TO_EVERYONE"
    | "MUTUAL_FOLLOW_FRIENDS"
    | "FOLLOWER_OF_CREATOR";
  disabledComments: boolean;
  disabledDuet: boolean;
  disabledStitch: boolean;
  isBrandedContent: boolean;
  isYourBrand: boolean;
  isAiGenerated: boolean;
  title?: string;
  autoAddMusic?: boolean;
  isDraft?: boolean;
}

export interface YouTubeTarget {
  targetType: "youtube";
  title: string;
  privacyStatus: "private" | "public" | "unlisted";
  shouldNotifySubscribers: boolean;
  isMadeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  playlistIds?: string[];
  thumbnailUrl?: string;
}

export type BlotatoTarget = InstagramTarget | TikTokTarget | YouTubeTarget | { targetType: BlotatoPlatform };

export interface PublishPostInput {
  accountId: string;
  text: string;
  mediaUrls: string[];
  platform: BlotatoPlatform;
  target: BlotatoTarget;
  scheduledTime?: string;
  useNextFreeSlot?: boolean;
}

export interface PublishPostResponse {
  postSubmissionId: string;
}

export async function publishPost(input: PublishPostInput): Promise<PublishPostResponse> {
  log.info("publish post", { platform: input.platform, scheduled: input.scheduledTime ?? "now" });
  const body = {
    post: {
      accountId: input.accountId,
      content: {
        text: input.text,
        mediaUrls: input.mediaUrls,
        platform: input.platform,
      },
      target: input.target,
    },
    ...(input.scheduledTime ? { scheduledTime: input.scheduledTime } : {}),
    ...(input.useNextFreeSlot ? { useNextFreeSlot: true } : {}),
  };
  return blotato<PublishPostResponse>("POST", "/posts", body);
}

// ===========================================================================
// Structured-inputs builders.
//
// These map our generated content (script, scenes, voiceover) to the exact
// `inputs` shape a Blotato template expects, so we get deterministic output
// instead of relying on the natural-language `prompt` auto-fill.
//
// IMPORTANT: Blotato's per-template input schemas are not fully documented
// publicly — the canonical source is `GET /v2/videos/templates?fields=...,inputs`.
// Run `npm run cli -- template <id>` to see the exact shape for YOUR chosen
// template, then adjust these builders' field names if your template differs.
// ===========================================================================

export interface AiStoryVideoSceneInput {
  /** One sentence of voiceover for this scene. */
  script: string;
  /** What the visual for this scene should look like — used by Blotato's AI image model. */
  mediaPrompt?: string;
}

export interface BuildAiStoryVideoInputsArgs {
  scenes: AiStoryVideoSceneInput[];
  voiceName?: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  captionPosition?: "top" | "middle" | "bottom";
  highlightColor?: string;
  transition?: string;
  aiImageModel?: string;
  animateAiImages?: boolean;
  trimToVoiceover?: boolean;
}

/**
 * Build the `inputs` object for Blotato's "AI Story Video with AI Voice" template.
 * Field names follow the template inputs documented at /v2/videos/templates.
 *
 * NOTE: `scenes[].mediaSource` is a union (AI-generated vs URL). We default to
 * the AI variant. If your template version uses a different discriminator
 * (e.g. `kind` instead of `type`), adjust here.
 */
export function buildAiStoryVideoInputs(args: BuildAiStoryVideoInputsArgs): Record<string, unknown> {
  return {
    scenes: args.scenes.map((s) => ({
      script: s.script,
      mediaSource: { type: "ai", prompt: s.mediaPrompt ?? s.script },
    })),
    voiceName: args.voiceName ?? "default",
    aspectRatio: args.aspectRatio ?? "9:16",
    captionPosition: args.captionPosition ?? "bottom",
    highlightColor: args.highlightColor ?? "#FFFFFF",
    transition: args.transition ?? "fade",
    aiImageModel: args.aiImageModel ?? "default",
    animateAiImages: args.animateAiImages ?? true,
    trimToVoiceover: args.trimToVoiceover ?? true,
  };
}

/**
 * Split a paragraph of voiceover into one sentence per scene, padded/truncated
 * to match a target scene count. Useful when our LLM emitted a single
 * voiceover blob but the template wants per-scene scripts.
 */
export function splitVoiceoverIntoScenes(voiceover: string, sceneCount: number): string[] {
  const sentences = voiceover
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return Array(sceneCount).fill("");
  const out: string[] = [];
  for (let i = 0; i < sceneCount; i++) {
    out.push(sentences[i % sentences.length]!);
  }
  return out;
}

/**
 * Resolve account id for a platform from env. Returns null if not configured.
 */
export function accountIdFor(platform: "tiktok" | "instagram" | "youtube"): string | null {
  if (platform === "tiktok") return env.blotato.tiktokAccountId || null;
  if (platform === "instagram") return env.blotato.instagramAccountId || null;
  if (platform === "youtube") return env.blotato.youtubeAccountId || null;
  return null;
}

/**
 * Flat union of every optional field across platforms (without the targetType
 * discriminator). Lets callers pass overrides without TypeScript collapsing
 * the intersection to `never`.
 */
export type TargetOverrides = Partial<Omit<TikTokTarget, "targetType">> &
  Partial<Omit<InstagramTarget, "targetType">> &
  Partial<Omit<YouTubeTarget, "targetType">>;

/**
 * Build a Blotato target object from minimal inputs, applying safe defaults.
 * Caller can override any field by passing partial overrides.
 */
export function buildTarget(
  platform: "tiktok" | "instagram" | "youtube",
  overrides: TargetOverrides = {},
  context: { title?: string; isAiGenerated?: boolean } = {},
): BlotatoTarget {
  if (platform === "tiktok") {
    return {
      targetType: "tiktok",
      privacyLevel: overrides.privacyLevel ?? "PUBLIC_TO_EVERYONE",
      disabledComments: overrides.disabledComments ?? false,
      disabledDuet: overrides.disabledDuet ?? false,
      disabledStitch: overrides.disabledStitch ?? false,
      isBrandedContent: overrides.isBrandedContent ?? false,
      isYourBrand: overrides.isYourBrand ?? false,
      isAiGenerated: overrides.isAiGenerated ?? context.isAiGenerated ?? true,
      title: overrides.title ?? context.title,
      autoAddMusic: overrides.autoAddMusic,
      isDraft: overrides.isDraft,
    };
  }
  if (platform === "instagram") {
    return {
      targetType: "instagram",
      mediaType: overrides.mediaType ?? "reel",
      altText: overrides.altText,
      collaborators: overrides.collaborators,
      coverImageUrl: overrides.coverImageUrl,
      shareToFeed: overrides.shareToFeed ?? true,
    };
  }
  // youtube
  return {
    targetType: "youtube",
    title: overrides.title ?? context.title ?? "Untitled",
    privacyStatus: overrides.privacyStatus ?? "public",
    shouldNotifySubscribers: overrides.shouldNotifySubscribers ?? true,
    isMadeForKids: overrides.isMadeForKids ?? false,
    containsSyntheticMedia: overrides.containsSyntheticMedia ?? (context.isAiGenerated ?? true),
    playlistIds: overrides.playlistIds,
    thumbnailUrl: overrides.thumbnailUrl,
  };
}
