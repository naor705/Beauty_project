import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { getContent } from "../db/repositories/content.js";
import { getApprovalForContent } from "../db/repositories/approvals.js";
import { getSelection } from "../db/repositories/selections.js";
import { schedulePost, setPostStatus, appendLog, getPost } from "../db/repositories/posts.js";
import { publishToTikTok } from "../integrations/tiktok.js";
import { publishToInstagram } from "../integrations/instagram.js";
import { accountIdFor, buildTarget, publishPost as blotatoPublish } from "../integrations/blotato.js";
import type { PublishPlatform, ScheduledPost } from "../types/index.js";

const log = createLogger("agent:publishing");

export interface ScheduleInput {
  generatedContentId: string;
  platform: PublishPlatform;
  publishAt: string; // ISO
}

/**
 * Schedule a post. Hard-blocks unless an APPROVED approval exists for the content.
 * Creates one scheduled_posts row per platform (TikTok and Instagram both -> 2 rows).
 */
export function scheduleApprovedPost(input: ScheduleInput): ScheduledPost[] {
  const content = getContent(input.generatedContentId);
  if (!content) throw new Error(`generated_content not found: ${input.generatedContentId}`);

  const approval = getApprovalForContent(content.id);
  if (!approval || approval.status !== "approved") {
    throw new Error(
      `cannot schedule: approval is "${approval?.status ?? "missing"}" for content ${content.id}`,
    );
  }

  const platforms: ("tiktok" | "instagram")[] =
    input.platform === "both" ? ["tiktok", "instagram"] : [input.platform];

  const created: ScheduledPost[] = [];
  for (const p of platforms) {
    const post = schedulePost({
      generated_content_id: content.id,
      platform: p,
      publish_at: input.publishAt,
    });
    log.info(`scheduled ${post.id} on ${p} for ${input.publishAt}`);
    created.push(post);
  }
  return created;
}

/**
 * Execute a single scheduled post. Re-checks approval at publish-time.
 * Mocked unless DRY_RUN=false AND a real provider is wired.
 */
export async function executeScheduledPost(scheduledPostId: string): Promise<void> {
  const post = getPost(scheduledPostId);
  if (!post) throw new Error(`scheduled_posts not found: ${scheduledPostId}`);

  if (post.status !== "scheduled") {
    log.warn(`skip: status is ${post.status}`, { scheduledPostId });
    return;
  }

  const content = getContent(post.generated_content_id);
  if (!content) throw new Error(`content vanished for post ${post.id}`);

  const approval = getApprovalForContent(content.id);
  if (!approval || approval.status !== "approved") {
    setPostStatus(post.id, "cancelled");
    appendLog({
      scheduled_post_id: post.id,
      platform: post.platform === "both" ? "instagram" : post.platform,
      attempt: 1,
      status: "error",
      message: `approval not granted (status=${approval?.status ?? "missing"})`,
    });
    return;
  }

  const selection = getSelection(content.selected_trend_id);
  log.info(`publishing post ${post.id}`, {
    platform: post.platform,
    contentType: content.content_type,
    selection: selection?.id,
  });

  setPostStatus(post.id, "publishing");

  const payload = {
    caption: `${content.hook}\n\n${content.caption}\n\n${content.cta}\n\n${content.hashtags.join(" ")}`,
    hashtags: content.hashtags,
    videoUrl:
      content.content_type === "faceless_video" || content.content_type === "generated_video"
        ? content.asset_url ?? undefined
        : undefined,
    imageUrl: content.content_type === "image" ? content.asset_url ?? undefined : undefined,
  };

  const platforms: ("tiktok" | "instagram")[] =
    post.platform === "both" ? ["tiktok", "instagram"] : [post.platform];

  let allOk = true;
  for (const p of platforms) {
    try {
      const res = await publishOnePlatform(p, payload, content);
      appendLog({
        scheduled_post_id: post.id,
        platform: p,
        attempt: 1,
        status: res.ok ? "ok" : "error",
        message: res.message,
        payload: { remoteId: res.id, payload },
      });
      if (!res.ok) allOk = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog({
        scheduled_post_id: post.id,
        platform: p,
        attempt: 1,
        status: "error",
        message: msg,
      });
      allOk = false;
    }
  }

  setPostStatus(post.id, allOk ? "published" : "failed");
  log.info(`post ${post.id} -> ${allOk ? "published" : "failed"}`);
}

interface PlatformPayload {
  caption: string;
  hashtags: string[];
  videoUrl?: string;
  imageUrl?: string;
}

interface ContentLike {
  hook: string;
  caption: string;
  asset_url: string | null;
  content_type: string;
}

interface PlatformPublishResult {
  ok: boolean;
  id?: string;
  message: string;
}

async function publishOnePlatform(
  platform: "tiktok" | "instagram",
  payload: PlatformPayload,
  content: ContentLike,
): Promise<PlatformPublishResult> {
  if (env.blotato.publishViaBlotato) {
    return publishViaBlotato(platform, payload, content);
  }
  // Fallback: direct TikTok / Instagram Graph API mocks.
  return platform === "tiktok"
    ? publishToTikTok(payload, env.dryRun)
    : publishToInstagram(payload, env.dryRun);
}

async function publishViaBlotato(
  platform: "tiktok" | "instagram",
  payload: PlatformPayload,
  content: ContentLike,
): Promise<PlatformPublishResult> {
  const accountId = accountIdFor(platform);
  if (!accountId) {
    return { ok: false, message: `BLOTATO_${platform.toUpperCase()}_ACCOUNT_ID not set` };
  }
  const mediaUrl = payload.videoUrl ?? payload.imageUrl;
  const mediaUrls = mediaUrl ? [mediaUrl] : [];

  if (env.dryRun) {
    log.info("DRY_RUN — would publish via Blotato", {
      platform,
      accountId,
      captionPreview: payload.caption.slice(0, 80),
      mediaUrls,
    });
    return { ok: true, id: `dryrun_${platform}`, message: "dry-run accepted (blotato)" };
  }

  try {
    const target = buildTarget(platform, {}, { title: content.hook, isAiGenerated: true });
    const res = await blotatoPublish({
      accountId,
      text: payload.caption,
      mediaUrls,
      platform,
      target,
    });
    return { ok: true, id: res.postSubmissionId, message: "submitted to blotato" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
