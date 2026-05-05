# Beauty Researcher — MVP

AI Market Research + Content Creation agent for **beauty-care** trends.

The agent runs daily, harvests TikTok / Instagram (+ optional YouTube Shorts and Reddit) signals, ranks them by engagement, and every 3 days produces a **top-10 trend report** with per-trend insights. A human selects which trend to convert into content — image, caption, faceless video, or fully generated video — approves the result, and schedules it to TikTok, Instagram, or both. **Nothing is posted without explicit human approval.**

## What's in the box

- TypeScript / Node.js 20+
- SQLite via `better-sqlite3` (swap-friendly to Postgres)
- Pluggable LLM provider — `anthropic`, `openai`, or `mock` (default)
- Mocked TikTok + Instagram research and publishing with **clear `TODO(real)` markers** for real-API hookup
- Pluggable image / video providers (OpenAI Images, Creatomate, Runway, Pika)
- Approval flow over Telegram / email / console
- Cron scheduler (daily research, every-3-days report, per-minute publisher tick)
- **MCP-ready** tool registry — every capability is a typed tool contract
- A full CLI for manual testing of every step

## Quickstart

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# default LLM_PROVIDER=mock + DRY_RUN=true means nothing external is called

# 3. Initialize the database
npm run db:init

# 4. Run a research pass (uses mock TikTok + Instagram data)
npm run cli -- research --include-optional

# 5. Generate the 3-day trend report
npm run cli -- report

# 6. Pick a trend → generate content → approve → schedule → publish (mocked)
npm run cli -- top
npm run cli -- select \
  --report latest \
  --result <result-id-from-top> \
  --type faceless_video \
  --platform both
npm run cli -- generate <selectionId>
npm run cli -- request-approval <contentId>
npm run cli -- approve <approvalId>
npm run cli -- schedule -c <contentId> -p both -a 2026-05-05T18:00:00Z
npm run cli -- publish-now <postId>     # or run the scheduler: npm run scheduler
```

## CLI reference

```
beauty research               run a single research pass
beauty top                    show top results in DB
beauty report                 generate a 3-day top-10 report
beauty reports                list recent reports
beauty show-report <id|latest>
beauty select ...             choose a trend + content_type + platform
beauty selections             list selections
beauty generate <selectionId> generate content artifacts
beauty show-content <id>
beauty contents-for <selectionId>
beauty request-approval <contentId>
beauty approve <approvalId>
beauty reject <approvalId> --reason "..."
beauty pending-approvals
beauty schedule -c <contentId> -p both -a <iso>
beauty publish-now <postId>
beauty posts
beauty post-logs <postId>
beauty tools                  list MCP tool contracts
```

## Scheduler

```bash
npm run scheduler
# RESEARCH_CRON  — daily research job (default 06:00 UTC)
# REPORT_CRON    — every 3 days report job (default 09:00 UTC)
# Publisher tick — every minute, runs any due scheduled posts (still approval-gated)
```

## MCP

Every public capability is exposed as a tool contract in `src/mcp/tools.ts`:

```
search_social_media   run_research        summarize_trend
select_trend          generate_image_prompt  generate_video_prompt
create_image          create_video        send_notification
request_approval      schedule_post       publish_post
scrape_url
```

A simple stdin JSON-RPC loop runs via `npm run mcp`. Drop-in `@modelcontextprotocol/sdk` is left as a `TODO(real)` to keep MVP dependency-light.

## Safety rules baked in

- `DRY_RUN=true` (default) → no real publish call ever fires.
- `executeScheduledPost` re-checks the approval status at publish time, not just at schedule time.
- Mocked content is **inspired** by trends, never copied. The content agent system prompt explicitly forbids reusing source phrasing.
- Every publish attempt writes a row in `post_logs` with the exact payload.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules and data flow
- [docs/DATABASE.md](docs/DATABASE.md) — schema and indexes
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — end-to-end happy path
- [docs/DEPLOY.md](docs/DEPLOY.md) — three ways to run it (`.bat` launcher, Windows Task Scheduler, Railway cloud)
- [docs/TELEGRAM.md](docs/TELEGRAM.md) — Telegram approval bot: one-tap approve/reject from your phone
- [docs/WORKFLOW_DIAGRAM.md](docs/WORKFLOW_DIAGRAM.md) — visual workflow diagrams (Mermaid) for demo meetings
- [docs/ONBOARDING.md](docs/ONBOARDING.md) — full setup walkthrough for new collaborators (assume zero prior coding/git experience)
- [docs/ROADMAP.md](docs/ROADMAP.md) — what to build next

## API key requirements (for going past MVP)

| Capability | Provider | Env vars | Status |
| --- | --- | --- | --- |
| LLM summarization + content | Anthropic OR OpenAI | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | TODO(real) hookup |
| TikTok research | TikTok Research API (apply) | `TIKTOK_API_KEY/SECRET` | mocked |
| TikTok publishing | TikTok Content Posting API | OAuth, `video.publish` scope | mocked |
| Instagram research+publish | Instagram Graph API | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` | mocked |
| YouTube Shorts | YouTube Data API v3 | `YOUTUBE_API_KEY` | mocked |
| Reddit | Reddit OAuth app | `REDDIT_CLIENT_ID/SECRET` | mocked |
| Image gen | OpenAI Images / Stability | `IMAGE_API_KEY` | mocked |
| Video gen | Creatomate / Runway / Pika | `CREATOMATE_API_KEY` / etc. | mocked |
| Notifications | Telegram bot or SMTP | `TELEGRAM_*` / `SMTP_*` | console fallback |

## License

Private MVP — not for redistribution.
