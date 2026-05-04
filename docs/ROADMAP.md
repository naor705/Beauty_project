# Roadmap — past MVP

## Phase 1 — wire real APIs (1–2 weeks)

- [ ] **LLM provider** — replace mock with Anthropic SDK (default) or OpenAI SDK. Add prompt caching for system prompts; add retry/backoff on 429.
- [ ] **TikTok Research API** — apply, then implement `searchBeautyTrends` for real. The mock data shape already mirrors what the real API returns.
- [ ] **TikTok Content Posting API** — implement `publishToTikTok` real path with OAuth + `video.publish` scope. Poll `/post/publish/status/fetch/` until `PUBLISH_COMPLETE`.
- [ ] **Instagram Graph API** — hashtag search → top_media; container → media_publish for posting. Reels need `media_type=REELS`.
- [ ] **Telegram notifications** — implement `sendNotification` for telegram with inline keyboard buttons that POST back to a webhook for one-tap approval.
- [ ] **Image / video providers** — wire OpenAI Images + Creatomate (template-based is the most controllable for faceless videos). Persist outputs to S3 or local `data/assets/`.

## Phase 2 — UX (2–3 weeks)

- [ ] **Web dashboard** — Next.js app reading from the same SQLite/Postgres. Pages: research feed, latest report, selection wizard, approval queue, post calendar.
- [ ] **Approval webhook server** — small Express endpoint so Telegram and email links can hit `/approve/:id` directly.
- [ ] **Calendar view** — visualize `scheduled_posts` per platform with drag-to-reschedule.
- [ ] **Voiceover generation** — ElevenLabs / Azure TTS for faceless videos. Store SRT + mp3 alongside video.

## Phase 3 — intelligence (3–4 weeks)

- [ ] **Performance feedback loop** — pull metrics on **our own** posted content after 24h / 72h / 7d. Train a tiny re-ranker that biases trend selection toward what historically converts for this brand voice.
- [ ] **Brand voice profile** — add a `brand_voices` table with vocabulary, tone, banned phrases. Inject into every `content_pack` system prompt.
- [ ] **A/B variants** — generate 2–3 hook variants per content; pick at publish time using bandit selection.
- [ ] **Competitor tracker** — store specific creator handles + monitor their top posts weekly.

## Phase 4 — productionization

- [ ] **Postgres migration** — see [DATABASE.md](DATABASE.md). Add Drizzle or Prisma if the team prefers an ORM.
- [ ] **Job queue** — replace per-minute cron with BullMQ/SQS for retry semantics.
- [ ] **Real MCP server** — swap stdin loop for `@modelcontextprotocol/sdk` stdio transport. Add `resources` for trend reports so an external Claude can read them inline.
- [ ] **Rate-limit & cost tracking** — log token spend per LLM call into a new `llm_calls` table. Surface monthly spend in dashboard.
- [ ] **Multi-tenant** — add `brand_id` foreign key to research, reports, content, posts. Required before serving external clients.

## Phase 5 — content quality

- [ ] **Originality check** — embedding-distance check between generated caption and source caption; reject if cosine > 0.85.
- [ ] **Compliance check** — claim-detector that flags health/medical claims that need disclaimers.
- [ ] **Asset QA** — automated check that generated videos meet platform aspect/duration/audio specs before scheduling.

## What's deliberately out of scope for MVP

- Multi-user auth and RBAC
- Real-time analytics dashboard
- Direct DM / comment management on social platforms
- Cross-platform shoppable links (TikTok Shop / IG Shopping)
- Mobile companion app
