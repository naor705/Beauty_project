import { nanoid } from "nanoid";
import { getDb } from "../client.js";
import type { ApprovalRequest, ApprovalStatus } from "../../types/index.js";

type Row = {
  id: string;
  generated_content_id: string;
  channel: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  reason: string | null;
};

function toModel(r: Row): ApprovalRequest {
  return {
    id: r.id,
    generated_content_id: r.generated_content_id,
    channel: r.channel as ApprovalRequest["channel"],
    status: r.status as ApprovalStatus,
    requested_at: r.requested_at,
    decided_at: r.decided_at,
    decided_by: r.decided_by,
    reason: r.reason,
  };
}

export function createApproval(input: {
  generated_content_id: string;
  channel: ApprovalRequest["channel"];
}): ApprovalRequest {
  const db = getDb();
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO approval_requests (id, generated_content_id, channel) VALUES (?, ?, ?)`,
  ).run(id, input.generated_content_id, input.channel);
  const row = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(id) as Row;
  return toModel(row);
}

export function decideApproval(input: {
  id: string;
  status: Exclude<ApprovalStatus, "pending">;
  decided_by?: string;
  reason?: string;
}): ApprovalRequest | null {
  const db = getDb();
  db.prepare(
    `UPDATE approval_requests
     SET status = ?, decided_at = datetime('now'), decided_by = ?, reason = ?
     WHERE id = ?`,
  ).run(input.status, input.decided_by ?? "cli", input.reason ?? null, input.id);
  const row = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(input.id) as Row | undefined;
  return row ? toModel(row) : null;
}

export function getApproval(id: string): ApprovalRequest | null {
  const row = getDb().prepare("SELECT * FROM approval_requests WHERE id = ?").get(id) as Row | undefined;
  return row ? toModel(row) : null;
}

export function getApprovalForContent(contentId: string): ApprovalRequest | null {
  const row = getDb()
    .prepare("SELECT * FROM approval_requests WHERE generated_content_id = ? ORDER BY requested_at DESC LIMIT 1")
    .get(contentId) as Row | undefined;
  return row ? toModel(row) : null;
}

export function listPendingApprovals(): ApprovalRequest[] {
  const rows = getDb()
    .prepare("SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY requested_at ASC")
    .all() as Row[];
  return rows.map(toModel);
}
