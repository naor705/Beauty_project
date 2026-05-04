/**
 * MCP-ready tool contracts.
 *
 * Every public capability in this codebase is registered here as a tool with:
 *   - a name (snake_case)
 *   - a JSON Schema for input
 *   - a handler that returns a JSON-serializable result
 *
 * The MCP server (./server.ts) just exposes these to clients. Internal callers
 * (CLI, scheduler, agents) can invoke `runTool(name, input)` directly without
 * standing up a transport.
 *
 * TODO(real): replace this lightweight registry with `@modelcontextprotocol/sdk`
 * once we move from CLI-only to a hosted MCP server.
 */
import { runResearchJob } from "../agents/research-agent.js";
import { runTrendAnalysisJob } from "../agents/trend-analysis-agent.js";
import { runContentGeneration } from "../agents/content-agent.js";
import { requestApproval } from "../agents/approval-flow.js";
import { scheduleApprovedPost, executeScheduledPost } from "../agents/publishing-agent.js";
import { generateImage } from "../integrations/image-gen.js";
import { generateVideo } from "../integrations/video-gen.js";
import { sendNotification } from "../integrations/notify.js";
import { searchBeautyTrends } from "../integrations/tiktok.js";
import { searchBeautyReels } from "../integrations/instagram.js";
import { createSelection } from "../db/repositories/selections.js";

export interface ToolDefinition<I, O> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: I) => Promise<O> | O;
}

const tools: ToolDefinition<unknown, unknown>[] = [];

function register<I, O>(t: ToolDefinition<I, O>): ToolDefinition<I, O> {
  tools.push(t as ToolDefinition<unknown, unknown>);
  return t;
}

// ---------------------------------------------------------------------------
// Research / discovery
// ---------------------------------------------------------------------------

export const SearchSocialMedia = register({
  name: "search_social_media",
  description: "Search a platform for beauty-care trends; returns normalized results.",
  inputSchema: {
    type: "object",
    properties: {
      platform: { type: "string", enum: ["tiktok", "instagram"] },
      niche: { type: "string", default: "beauty care" },
      limit: { type: "number", default: 10 },
    },
    required: ["platform"],
  },
  handler: async (input: { platform: "tiktok" | "instagram"; niche?: string; limit?: number }) => {
    const niche = input.niche ?? "beauty care";
    const limit = input.limit ?? 10;
    if (input.platform === "tiktok") return searchBeautyTrends({ niche, limit });
    return searchBeautyReels({ niche, limit });
  },
});

export const ScrapeUrl = register({
  name: "scrape_url",
  description: "Mock URL scraper. Real implementation should fetch and extract text/metadata.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  handler: (input: { url: string }) => {
    // TODO(real): use playwright or a fetch+readability pipeline. Respect robots.txt.
    return { url: input.url, title: "(mock)", text: "(mock body)", fetched_at: new Date().toISOString() };
  },
});

// ---------------------------------------------------------------------------
// Trend pipeline
// ---------------------------------------------------------------------------

export const RunResearch = register({
  name: "run_research",
  description: "Run the daily beauty-care research job across configured sources.",
  inputSchema: {
    type: "object",
    properties: {
      niche: { type: "string" },
      perSource: { type: "number" },
      includeOptional: { type: "boolean" },
    },
  },
  handler: (input: { niche?: string; perSource?: number; includeOptional?: boolean }) =>
    runResearchJob(input),
});

export const SummarizeTrend = register({
  name: "summarize_trend",
  description: "Run the 3-day trend analysis and produce a top-N report with insights.",
  inputSchema: {
    type: "object",
    properties: {
      windowDays: { type: "number", default: 3 },
      topN: { type: "number", default: 10 },
    },
  },
  handler: (input: { windowDays?: number; topN?: number }) => runTrendAnalysisJob(input),
});

// ---------------------------------------------------------------------------
// Selection + content
// ---------------------------------------------------------------------------

export const SelectTrend = register({
  name: "select_trend",
  description: "Mark a trend from a report as selected for content production.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string" },
      resultId: { type: "string" },
      contentType: { type: "string", enum: ["image", "caption_post", "faceless_video", "generated_video"] },
      targetPlatform: { type: "string", enum: ["tiktok", "instagram", "both"] },
      publishAt: { type: "string", description: "ISO timestamp; optional" },
      notes: { type: "string" },
    },
    required: ["reportId", "resultId", "contentType", "targetPlatform"],
  },
  handler: (input: {
    reportId: string;
    resultId: string;
    contentType: "image" | "caption_post" | "faceless_video" | "generated_video";
    targetPlatform: "tiktok" | "instagram" | "both";
    publishAt?: string;
    notes?: string;
  }) =>
    createSelection({
      report_id: input.reportId,
      result_id: input.resultId,
      content_type: input.contentType,
      target_platform: input.targetPlatform,
      publish_at: input.publishAt,
      notes: input.notes,
    }),
});

export const GenerateImagePrompt = register({
  name: "generate_image_prompt",
  description: "Generate an image asset for a selected trend.",
  inputSchema: {
    type: "object",
    properties: { selectedTrendId: { type: "string" } },
    required: ["selectedTrendId"],
  },
  handler: (input: { selectedTrendId: string }) =>
    runContentGeneration({ selectedTrendId: input.selectedTrendId }),
});

export const GenerateVideoPrompt = register({
  name: "generate_video_prompt",
  description:
    "Generate video content (faceless or fully generated) for a selected trend; returns a content row with asset_url.",
  inputSchema: {
    type: "object",
    properties: { selectedTrendId: { type: "string" } },
    required: ["selectedTrendId"],
  },
  handler: (input: { selectedTrendId: string }) =>
    runContentGeneration({ selectedTrendId: input.selectedTrendId }),
});

export const CreateImage = register({
  name: "create_image",
  description: "Low-level image generation (provider-direct).",
  inputSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, size: { type: "string" } },
    required: ["prompt"],
  },
  handler: (input: { prompt: string; size?: "1024x1024" | "1024x1792" | "1792x1024" }) =>
    generateImage(input),
});

export const CreateVideo = register({
  name: "create_video",
  description: "Low-level video generation (provider-direct).",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["faceless", "generated"] },
      script: { type: "string" },
      scenes: { type: "array", items: { type: "string" } },
      voiceoverText: { type: "string" },
      subtitlesSrt: { type: "string" },
      visualInstructions: { type: "string" },
      prompt: { type: "string" },
      durationSeconds: { type: "number" },
    },
    required: ["kind"],
  },
  handler: (
    input:
      | {
          kind: "faceless";
          script: string;
          scenes: string[];
          voiceoverText: string;
          subtitlesSrt?: string;
          visualInstructions?: string;
        }
      | { kind: "generated"; prompt: string; durationSeconds?: number },
  ) => generateVideo(input),
});

// ---------------------------------------------------------------------------
// Approval + publishing
// ---------------------------------------------------------------------------

export const SendNotification = register({
  name: "send_notification",
  description: "Send an approval/notification message via the configured channel.",
  inputSchema: {
    type: "object",
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
      approvalId: { type: "string" },
      contentId: { type: "string" },
    },
    required: ["subject", "body"],
  },
  handler: (input: { subject: string; body: string; approvalId?: string; contentId?: string }) =>
    sendNotification(input),
});

export const RequestApproval = register({
  name: "request_approval",
  description: "Open an approval request and notify the user; nothing is posted before approval.",
  inputSchema: {
    type: "object",
    properties: { generatedContentId: { type: "string" } },
    required: ["generatedContentId"],
  },
  handler: (input: { generatedContentId: string }) => requestApproval(input),
});

export const SchedulePost = register({
  name: "schedule_post",
  description: "Schedule an approved post on TikTok, Instagram, or both.",
  inputSchema: {
    type: "object",
    properties: {
      generatedContentId: { type: "string" },
      platform: { type: "string", enum: ["tiktok", "instagram", "both"] },
      publishAt: { type: "string", description: "ISO timestamp" },
    },
    required: ["generatedContentId", "platform", "publishAt"],
  },
  handler: (input: {
    generatedContentId: string;
    platform: "tiktok" | "instagram" | "both";
    publishAt: string;
  }) => scheduleApprovedPost(input),
});

export const PublishPost = register({
  name: "publish_post",
  description:
    "Execute a scheduled post immediately (still gated on approval). Honors DRY_RUN env var.",
  inputSchema: {
    type: "object",
    properties: { scheduledPostId: { type: "string" } },
    required: ["scheduledPostId"],
  },
  handler: async (input: { scheduledPostId: string }) => {
    await executeScheduledPost(input.scheduledPostId);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export function listTools(): ToolDefinition<unknown, unknown>[] {
  return tools.slice();
}

export async function runTool(name: string, input: unknown): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool.handler(input);
}
