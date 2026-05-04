# End-to-end workflow

## 1. Daily research

Triggered by cron (`RESEARCH_CRON`, default `0 6 * * *`) or manually.

```
runResearchJob({ niche, perSource, includeOptional })
  ├─ TikTok.searchBeautyTrends(niche)
  ├─ Instagram.searchBeautyReels(niche)
  ├─ (optional) YouTube.searchYouTubeShorts(niche)
  └─ (optional) Reddit.searchRedditBeauty(niche)
```

Each result is normalized to `ResearchResult`, scored, and **upserted by URL** so daily re-runs refresh metrics rather than duplicate rows.

```bash
npm run cli -- research --include-optional
npm run cli -- top
```

## 2. Three-day report

Triggered by cron (`REPORT_CRON`, default `0 9 */3 * *`) or manually.

```
runTrendAnalysisJob({ windowDays: 3, topN: 10 })
  ├─ pull research_results since (now - windowDays)
  ├─ rank by engagement_score
  ├─ take top 10
  ├─ for each: callLLM(intent: trend_insight) → TrendInsight
  ├─ callLLM(intent: report_summary) → executive summary
  └─ persist trend_reports + trend_insights
```

```bash
npm run cli -- report
npm run cli -- show-report latest
```

## 3. User selects trends

The user reviews the report and selects one or more trends. A selection captures *which trend*, *what content type*, and *target platform*.

```bash
npm run cli -- select \
  --report latest \
  --result <result_id> \
  --type faceless_video \
  --platform both
```

## 4. Content generation

```
runContentGeneration({ selectedTrendId })
  ├─ fetch selection + result + matching insight
  ├─ callLLM(intent: content_pack) → hook, caption, hashtags, cta, script, shot_list, prompts...
  ├─ image            → generateImage(prompt)
  ├─ caption_post     → no asset
  ├─ faceless_video   → generateVideo({ kind: "faceless", script, scenes, voiceover, subtitles })
  └─ generated_video  → generateVideo({ kind: "generated", prompt, durationSeconds })
```

The system prompt explicitly forbids reusing source phrasing — output is *inspired*, not copied.

```bash
npm run cli -- generate <selectionId>
npm run cli -- show-content <contentId>
```

## 5. Approval

```
requestApproval({ generatedContentId })
  ├─ create approval_requests row (status=pending)
  └─ sendNotification → telegram | email | console
```

The user approves or rejects from the CLI (or, in production, by tapping a Telegram button or clicking an email link):

```bash
npm run cli -- approve <approvalId>
# or
npm run cli -- reject <approvalId> --reason "off-brand voice"
```

## 6. Scheduling

```
scheduleApprovedPost({ generatedContentId, platform: "both", publishAt })
  ├─ fail if approval is not status=approved
  ├─ fan out to ["tiktok", "instagram"] when platform === "both"
  └─ insert one scheduled_posts row per platform
```

```bash
npm run cli -- schedule -c <contentId> -p both -a 2026-05-05T18:00:00Z
npm run cli -- posts
```

## 7. Publishing

The scheduler ticks every minute and runs `executeScheduledPost(id)` on any due post:

```
executeScheduledPost(id)
  ├─ re-check approval status (publishing-time gate)
  ├─ build payload (caption + hashtags + asset URL)
  ├─ call publishToTikTok / publishToInstagram (DRY_RUN-aware)
  ├─ append post_logs row per platform attempt
  └─ set scheduled_posts.status = published | failed | cancelled
```

For fast manual testing:

```bash
npm run cli -- publish-now <postId>
npm run cli -- post-logs <postId>
```

## Failure modes covered

| Failure | What happens |
| --- | --- |
| Approval rejected after schedule | Publish-time re-check cancels the post and logs the reason |
| External API returns error | Logged in `post_logs`, `scheduled_posts.status=failed` |
| LLM returns unparsable JSON | `content-agent` falls back to safe defaults so the run never crashes |
| Same TikTok URL seen twice | Upsert refreshes metrics, single row preserved |
| `DRY_RUN=true` | All external sends short-circuit and return success with mock IDs |
