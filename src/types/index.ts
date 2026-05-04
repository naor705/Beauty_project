export type Platform = "tiktok" | "instagram" | "youtube" | "reddit" | "google_trends";
export type PublishPlatform = "tiktok" | "instagram" | "both";
export type ContentFormat = "short_video" | "reel" | "image" | "carousel" | "text";
export type ContentType = "image" | "caption_post" | "faceless_video" | "generated_video";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type PostStatus = "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export interface ResearchResult {
  id: string;
  platform: Platform;
  url: string;
  title: string;
  creator: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement_score: number;
  hashtags: string[];
  topic: string;
  content_format: ContentFormat;
  raw: unknown;
  found_at: string;
}

export interface TrendReport {
  id: string;
  generated_at: string;
  range_start: string;
  range_end: string;
  summary: string;
  top_result_ids: string[];
}

export interface TrendInsight {
  result_id: string;
  rank: number;
  summary: string;
  why_it_works: string;
  hook: string;
  pain_point: string;
  product_angle: string;
  content_idea: string;
  recommended_format: ContentFormat;
}

export interface SelectedTrend {
  id: string;
  report_id: string;
  result_id: string;
  selected_at: string;
  content_type: ContentType;
  target_platform: PublishPlatform;
  publish_at: string | null;
  notes: string | null;
}

export interface GeneratedContent {
  id: string;
  selected_trend_id: string;
  content_type: ContentType;
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  script: string | null;
  shot_list: string[] | null;
  image_prompt: string | null;
  video_prompt: string | null;
  voiceover_text: string | null;
  subtitles: string | null;
  visual_instructions: string | null;
  asset_url: string | null;
  generation_payload: unknown;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  generated_content_id: string;
  channel: "telegram" | "email" | "console";
  status: ApprovalStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  reason: string | null;
}

export interface ScheduledPost {
  id: string;
  generated_content_id: string;
  platform: PublishPlatform;
  publish_at: string;
  status: PostStatus;
  created_at: string;
}

export interface PostLog {
  id: string;
  scheduled_post_id: string;
  platform: "tiktok" | "instagram";
  attempt: number;
  status: "ok" | "error";
  message: string;
  payload: unknown;
  created_at: string;
}
