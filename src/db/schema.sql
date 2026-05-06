-- =====================================================
-- Beauty Researcher — SQLite Schema
-- =====================================================

CREATE TABLE IF NOT EXISTS research_results (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  creator TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  hashtags TEXT NOT NULL DEFAULT '[]',          -- JSON array
  topic TEXT NOT NULL,
  content_format TEXT NOT NULL,
  raw TEXT,                                     -- JSON blob of original payload
  found_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_engagement ON research_results(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_research_found_at ON research_results(found_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_platform ON research_results(platform);

CREATE TABLE IF NOT EXISTS trend_reports (
  id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  summary TEXT NOT NULL,
  top_result_ids TEXT NOT NULL DEFAULT '[]'     -- JSON array of result ids
);
CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON trend_reports(generated_at DESC);

CREATE TABLE IF NOT EXISTS trend_insights (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  summary TEXT NOT NULL,
  why_it_works TEXT NOT NULL,
  hook TEXT NOT NULL,
  pain_point TEXT NOT NULL,
  product_angle TEXT NOT NULL,
  content_idea TEXT NOT NULL,
  recommended_format TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES trend_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (result_id) REFERENCES research_results(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_insights_report ON trend_insights(report_id, rank);

CREATE TABLE IF NOT EXISTS selected_trends (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  selected_at TEXT NOT NULL DEFAULT (datetime('now')),
  content_type TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  publish_at TEXT,
  notes TEXT,
  FOREIGN KEY (report_id) REFERENCES trend_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (result_id) REFERENCES research_results(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS generated_content (
  id TEXT PRIMARY KEY,
  selected_trend_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  hook TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtags TEXT NOT NULL DEFAULT '[]',          -- JSON
  cta TEXT NOT NULL,
  script TEXT,
  shot_list TEXT,                               -- JSON array
  image_prompt TEXT,
  video_prompt TEXT,
  voiceover_text TEXT,
  subtitles TEXT,
  visual_instructions TEXT,
  asset_url TEXT,
  generation_payload TEXT,                      -- JSON blob ready to ship to provider
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (selected_trend_id) REFERENCES selected_trends(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_content_selected ON generated_content(selected_trend_id);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  generated_content_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT,
  reason TEXT,
  FOREIGN KEY (generated_content_id) REFERENCES generated_content(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  generated_content_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  publish_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (generated_content_id) REFERENCES generated_content(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON scheduled_posts(status, publish_at);

-- Generic key/value cache. Used today for caching Instagram hashtag IDs
-- (Graph API has a 30-unique-hashtags-per-7-days-per-user quota).
CREATE TABLE IF NOT EXISTS kv_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS post_logs (
  id TEXT PRIMARY KEY,
  scheduled_post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,                         -- ok | error
  message TEXT NOT NULL,
  payload TEXT,                                 -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (scheduled_post_id) REFERENCES scheduled_posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_logs_post ON post_logs(scheduled_post_id, created_at DESC);
