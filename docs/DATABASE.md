# Database schema

All tables live in [src/db/schema.sql](../src/db/schema.sql). SQLite by default; switch driver in [src/db/client.ts](../src/db/client.ts) for Postgres.

## Tables

### `research_results`
One row per discovered piece of content. Keyed by canonical URL so re-runs upsert.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | nanoid |
| `platform` | TEXT | tiktok / instagram / youtube / reddit / google_trends |
| `url` | TEXT UNIQUE | natural key for upsert |
| `title`, `creator` | TEXT | |
| `likes`, `comments`, `shares`, `views` | INTEGER | raw counters |
| `engagement_score` | INTEGER | weighted formula in [src/utils/engagement.ts](../src/utils/engagement.ts) |
| `hashtags` | TEXT (JSON array) | |
| `topic`, `content_format` | TEXT | |
| `raw` | TEXT (JSON) | original API payload for forensic debugging |
| `found_at` | TEXT (ISO) | |

Indexes: `engagement_score DESC`, `found_at DESC`, `platform`.

### `trend_reports`
One row per 3-day cycle.

| Column | Notes |
| --- | --- |
| `id` | PK |
| `generated_at`, `range_start`, `range_end` | ISO timestamps |
| `summary` | LLM-generated executive summary |
| `top_result_ids` | JSON array of `research_results.id` (length 10) |

### `trend_insights`
Per-trend breakdown for a report. FK → `trend_reports.id` and `research_results.id`.

Fields: `rank`, `summary`, `why_it_works`, `hook`, `pain_point`, `product_angle`, `content_idea`, `recommended_format`.

### `selected_trends`
The user picks one (or several) trends and tags how to convert it.

| Column | Notes |
| --- | --- |
| `report_id`, `result_id` | FKs |
| `content_type` | image / caption_post / faceless_video / generated_video |
| `target_platform` | tiktok / instagram / both |
| `publish_at` | optional — used when scheduling later |
| `notes` | free-form |

### `generated_content`
The output of `ContentAgent`. Holds every field needed for any of the four content types — irrelevant ones are NULL.

`hook`, `caption`, `hashtags`, `cta`, `script`, `shot_list`, `image_prompt`, `video_prompt`, `voiceover_text`, `subtitles`, `visual_instructions`, `asset_url`, `generation_payload`.

### `approval_requests`
| `status` | `pending` | `approved` | `rejected` |
| --- | --- | --- | --- |
Created on request, decided via CLI / Telegram / email. Posts cannot be scheduled until status=approved, and `executeScheduledPost` re-checks at publish time.

### `scheduled_posts`
| `status` | `scheduled` | `publishing` | `published` | `failed` | `cancelled` |
A "both" platform selection produces two rows (one tiktok, one instagram).

### `post_logs`
Append-only audit trail per publish attempt. Always written even on failure.

## ER diagram

```
research_results ─┐
                  ├── trend_insights ── trend_reports ── selected_trends ── generated_content ── approval_requests
                  │                                                              │
                  │                                                              └── scheduled_posts ── post_logs
                  └────────────────────────────────────────────────────────────── (result_id)
```

## Migration to Postgres

When ready:
1. Replace `better-sqlite3` with `pg` in `src/db/client.ts`.
2. Convert `TEXT` JSON columns to `JSONB`.
3. Convert IDs to `UUID` if desired (the repos already accept any string).
4. Add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` for `gen_random_uuid()`.
5. Promote `engagement_score` to a generated column for query-time recomputation.
