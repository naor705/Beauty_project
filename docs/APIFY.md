# Apify (managed scraping) setup

Apify gives the project a fast path to **real Instagram + TikTok trend data** without applying for the official Meta or TikTok research APIs. You pay per scrape (very cheap), Apify handles the proxies and anti-bot defenses.

## When to use this

| Situation | Use Apify? |
|---|---|
| You want real data **today** for a demo | ✅ Yes |
| You don't have time to wait weeks for TikTok Research API approval | ✅ Yes |
| Your Meta setup (Business IG + Page link) isn't done yet | ✅ Yes |
| You want engagement metrics (likes, comments, views) for posts you don't own | ✅ Yes (Graph API hides these) |
| You need TikTok trend data (no other realistic option) | ✅ Yes |
| You want to stay strictly within platform Terms of Service | ❌ No — use the Graph API path instead (see `docs/META_SETUP.md`) |

## Pricing

- **Free tier:** $5/month included with every Apify account
- **IG Hashtag Scraper:** ~$2.30 per 1000 posts
- **TikTok Scraper:** ~$0-4 per 1000 posts (varies by actor; we default to a free one)

Real-world cost for this project's daily research (50-100 posts/platform):
- ~$5-15/month if you stay within free tier
- ~$15-30/month for higher volume

## Setup

### 1. Sign up

Go to **https://apify.com/sign-up**. Google/GitHub login is fine. No credit card required for the free tier.

### 2. Get your API token

Once logged in:
1. Click your profile picture (top right) → **Settings**
2. Left sidebar → **Integrations**
3. Find **Personal API tokens** → click **Add a new token** (or copy an existing one)
4. Name it: `beauty-researcher`
5. Copy the token. It's a long string starting with something like `apify_api_...` or just opaque chars.

### 3. Configure `.env`

In your local `.env`:

```env
RESEARCH_PROVIDER=apify
APIFY_TOKEN=<paste your token here>

# Defaults — change only if you want to use different actors
APIFY_IG_ACTOR=apify/instagram-hashtag-scraper
APIFY_TT_ACTOR=clockworks/free-tiktok-scraper
```

Save.

### 4. Verify (free — no actor runs)

```powershell
npm run cli -- apify-test
```

Output should look like:
```
Apify connected:
  user:    @your_username (id=...)
  email:   you@example.com
  plan:    FREE
```

If this fails, your token is wrong — re-copy from Apify's settings page.

### 5. Run a real research pass (uses ~$0.10-0.30 of credit)

```powershell
npm run cli -- apify-research --limit 20
```

Takes ~60-120 seconds. Returns the top 20 unique beauty posts across both platforms with real captions, real engagement counts, real URLs.

### 6. Plug into the daily pipeline

That's it. With `RESEARCH_PROVIDER=apify` set, every `npm run cli -- demo` and every cron-fired research run automatically pulls real Apify data instead of mocks. Same UX, much better data.

## How to switch between providers

Edit one line in `.env`:

```env
RESEARCH_PROVIDER=mock      # cheap, fake, always works
RESEARCH_PROVIDER=apify     # real data, costs Apify credit
RESEARCH_PROVIDER=graph     # real data via official Meta API (free, see docs/META_SETUP.md)
```

You can flip between them at any time. The pipeline automatically adapts.

## What the actor returns vs what we use

**Instagram (`apify/instagram-hashtag-scraper`):**

| Field | We use |
|---|---|
| `url` / `shortCode` | ✅ ResearchResult.url |
| `caption` | ✅ ResearchResult.title (first 200 chars) |
| `hashtags[]` | ✅ ResearchResult.hashtags |
| `ownerUsername` | ✅ ResearchResult.creator |
| `likesCount`, `commentsCount` | ✅ Engagement score |
| `videoViewCount` / `videoPlayCount` | ✅ Views |
| `type` (Image/Video/Sidecar) | ✅ ResearchResult.content_format |

**TikTok (`clockworks/free-tiktok-scraper`):**

| Field | We use |
|---|---|
| `webVideoUrl` | ✅ ResearchResult.url |
| `text` | ✅ ResearchResult.title |
| `hashtags[].name` | ✅ ResearchResult.hashtags |
| `authorMeta.name` | ✅ ResearchResult.creator |
| `diggCount`, `commentCount`, `shareCount`, `playCount` | ✅ Engagement score |

The full raw payload is also stored in `ResearchResult.raw` for forensic debugging.

## Customizing hashtags

The default hashtags are in [`src/integrations/instagram.ts`](../src/integrations/instagram.ts) and [`src/integrations/tiktok.ts`](../src/integrations/tiktok.ts):

```typescript
const BEAUTY_HASHTAGS = ["skincare", "beautycare", "skincareroutine", "glassskin", "beautytips"];
```

Edit those constants to track different trends. Save, restart the scheduler if it's running.

## Switching to a different actor

Browse https://apify.com/store and find any IG or TikTok hashtag scraper you like. Copy its **Actor ID** (looks like `username/actor-name`) and put it in `.env`:

```env
APIFY_IG_ACTOR=different-author/different-actor
```

The integration will work as long as the actor accepts a `hashtags: string[]` input parameter and returns the standard fields. Different actors have different input schemas — check the actor's "Input" tab on Apify for what it expects, and adjust the call in [`src/integrations/apify.ts`](../src/integrations/apify.ts) if needed.

## Cost-saving tips

- **Lower the per-source limit** in `src/agents/research-agent.ts` (`perSource: 10` → `perSource: 5`)
- **Run research less frequently** — every 2 days instead of daily (set `RESEARCH_CRON` accordingly)
- **Cache hashtag results** for hours, not just hashtag IDs (advanced — would require schema change)
- **Use the free TikTok actor** (`clockworks/free-tiktok-scraper`) instead of paid ones

## Pitfalls

| Issue | Fix |
|---|---|
| `Apify auth failed: 401` | Token wrong or revoked — regenerate at apify.com/settings/integrations |
| Actor times out (>3 min) | Reduce `--limit` or check if the actor is currently broken on its store page |
| Returns 0 results | The hashtag might be misspelled or extremely niche. Try common ones first. |
| Duplicate posts in output | The same post matched multiple hashtags. Our research agent dedupes by URL before saving. |
| Free tier exhausted mid-month | Either upgrade Apify plan ($49/mo for 10x credit), reduce frequency, or temporarily set `RESEARCH_PROVIDER=mock` |
