import { createLogger } from "../utils/logger.js";
import { getContent } from "../db/repositories/content.js";
import { createApproval, decideApproval, getApproval } from "../db/repositories/approvals.js";
import { sendNotification } from "../integrations/notify.js";
import { env } from "../config/env.js";
import type { ApprovalRequest } from "../types/index.js";

const log = createLogger("agent:approval");

function renderBody(contentId: string): string {
  const c = getContent(contentId);
  if (!c) return `(content ${contentId} missing)`;
  const lines = [
    `Content type: ${c.content_type}`,
    `Hook:         ${c.hook}`,
    `Caption:      ${c.caption}`,
    `Hashtags:     ${c.hashtags.join(" ")}`,
    `CTA:          ${c.cta}`,
  ];
  if (c.asset_url) lines.push(`Asset URL:    ${c.asset_url}`);
  if (c.script) lines.push(`Script:\n${c.script}`);
  if (c.shot_list?.length) lines.push(`Shots:\n  - ${c.shot_list.join("\n  - ")}`);
  if (c.image_prompt) lines.push(`Image prompt: ${c.image_prompt}`);
  if (c.video_prompt) lines.push(`Video prompt: ${c.video_prompt}`);
  return lines.join("\n");
}

export async function requestApproval(input: { generatedContentId: string }): Promise<ApprovalRequest> {
  const channel = env.notify.channel;
  const approval = createApproval({
    generated_content_id: input.generatedContentId,
    channel,
  });

  await sendNotification({
    subject: `Approval needed for content ${input.generatedContentId}`,
    body: renderBody(input.generatedContentId),
    approvalId: approval.id,
    contentId: input.generatedContentId,
  });

  log.info(`approval ${approval.id} requested via ${channel}`);
  return approval;
}

export function approveContent(approvalId: string, decidedBy = "cli"): ApprovalRequest {
  const updated = decideApproval({ id: approvalId, status: "approved", decided_by: decidedBy });
  if (!updated) throw new Error(`approval not found: ${approvalId}`);
  log.info(`approval ${approvalId} approved by ${decidedBy}`);
  return updated;
}

export function rejectContent(approvalId: string, reason: string, decidedBy = "cli"): ApprovalRequest {
  const updated = decideApproval({ id: approvalId, status: "rejected", decided_by: decidedBy, reason });
  if (!updated) throw new Error(`approval not found: ${approvalId}`);
  log.info(`approval ${approvalId} rejected by ${decidedBy}: ${reason}`);
  return updated;
}

export function getApprovalById(id: string): ApprovalRequest | null {
  return getApproval(id);
}
