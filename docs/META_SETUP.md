# Meta / Instagram Graph API setup

What you need to do on Meta's side so the project can fetch real top-performing beauty reels from Instagram (instead of mock data).

This is a one-time setup, ~10-15 minutes. Once it's done, the system pulls real data automatically.

## What this enables

Without this setup, the `searchBeautyReels` function returns 10 mock reels with realistic-looking data. Useful for testing, but they're not actually trending content.

With this setup, the same function calls Instagram's Graph API directly, fetching the **top-performing real posts** for `#skincare`, `#beautycare`, `#skincareroutine`, `#glassskin`, and `#beautytips` (configurable in `src/integrations/instagram.ts`).

## Prerequisites

- A Facebook account
- An Instagram account for your brand
- Admin access to a Facebook Page (e.g. "Lovlis")
- ~10-15 minutes

---

## Step 1 — Convert your Instagram to a Business or Creator account

Personal IG accounts cannot use the Graph API at all. This must come first.

1. Open **Instagram** on your phone
2. Tap your profile icon (bottom right)
3. Tap the ☰ menu (top right) → **Settings and activity**
4. Scroll down to **For professionals** → **Switch to professional account**
5. Pick a category (e.g. "Beauty, Cosmetic & Personal Care")
6. Choose **Business** (not Creator — Business gives more API access)
7. Skip the "Connect to Facebook" prompt for now; we'll do that properly in Step 2

**Verify:** your IG profile should now show extra tabs like "Insights" and "Promotions."

---

## Step 2 — Link the Instagram Business account to your Facebook Page

1. Open **https://business.facebook.com** in a browser (Meta Business Suite)
2. If prompted, select or create a Business portfolio
3. Find your Facebook Page in the left sidebar (or page picker)
4. Click **Settings** (gear icon)
5. In Settings → **Linked accounts** (or **Instagram**)
6. Click **Connect Instagram Account**
7. Sign into the IG account from Step 1
8. Confirm the link

**Verify:** Back in Meta Business Suite, the Page should now show the connected IG handle.

---

## Step 3 — Create a Meta Developer App

If you don't already have one.

1. Go to **https://developers.facebook.com/apps/**
2. Click **Create App**
3. **Use case:** Other
4. **App type:** Business
5. **App name:** anything (e.g. `beauty-researcher`)
6. **App contact email:** yours
7. **Business portfolio:** pick the one that owns your Facebook Page
8. Click **Create app**

You're now in the App Dashboard.

---

## Step 4 — Add the Instagram Graph API product

1. In your App Dashboard left sidebar, look for **Add products to your app**
2. Find **Instagram Graph API** (or **Instagram**) → click **Set up**
3. You may also want to add **Pages API**

This unlocks the hashtag-search endpoints.

---

## Step 5 — Generate a Page Access Token with the right permissions

⚠ This is where token setup typically goes wrong. You need a **Page** Access Token (not a User Access Token) with **specific scopes**.

1. Open **https://developers.facebook.com/tools/explorer/**
2. **Top right corner** of the page:
   - **Meta App:** select the app you created in Step 3
   - **User or Page:** click the dropdown → **Get Page Access Token** → choose your Page
3. **Permissions panel.** Add these (click "Add a Permission" and check each):
   - `instagram_basic`
   - `pages_read_engagement`
   - `pages_show_list`
   - `instagram_manage_insights` (optional, useful for analytics later)
4. Click the blue **Generate Access Token** button
5. A consent dialog appears — accept it, log in if needed, accept all permission requests
6. **Copy the token** from the "Access Token" field at the top. It starts with `EAA...`

⚠ This token is short-lived (~1-2 hours). For production use, extend it to 60 days — see Step 6.

---

## Step 6 (recommended) — Extend the token to 60 days

Short-lived tokens expire fast. For a 60-day token:

1. In your **App Dashboard** → **Settings** → **Basic** → copy your **App ID** and **App Secret**
2. Open this URL in your browser (replacing the three placeholders):

   ```
   https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN
   ```

3. The response is JSON containing `access_token` — that's your 60-day token. Use this one in `.env`.

---

## Step 7 — Update `.env`

In VS Code, open `.env` and update:

```
INSTAGRAM_ACCESS_TOKEN=<paste the new token from Step 5 or 6>
```

You don't need to figure out the IG Business Account ID yourself — the diagnostic in Step 8 will tell you.

---

## Step 8 — Verify with the built-in diagnostic

```powershell
npm run cli -- ig-test
```

What you should see:

```
=== Instagram Graph API diagnostic ===

Token represents:        <page_id> (Lovlis)
Granted permissions:     instagram_basic, pages_read_engagement, pages_show_list, ...

Pages this token can manage (1):
  • Page <page_id> — Lovlis  →  IG=<ig_business_account_id> (@your_ig_handle)

In .env:
  INSTAGRAM_BUSINESS_ACCOUNT_ID=<some value>
  Works for hashtag search:    ✅ yes
```

If `Works for hashtag search` shows ❌, look at the **Notes** section the diagnostic prints — it auto-suggests the right ID.

Update `.env` line for `INSTAGRAM_BUSINESS_ACCOUNT_ID` with the value the diagnostic suggests, save, and re-run `ig-test` to confirm ✅.

---

## Step 9 — Fetch real beauty trends

```powershell
npm run cli -- ig-research
```

This fetches the top reels from Instagram for `#skincare`, `#beautycare`, etc. Free — no LLM or video API calls. Confirms real data is flowing.

Then run a normal research pipeline and the same data goes through the full ranking → reporting → content generation flow:

```powershell
npm run cli -- research
npm run cli -- report
```

---

## Common pitfalls

| Issue | What's wrong | Fix |
|---|---|---|
| `(#100) Object does not exist ... missing permission` | IG Business Account isn't linked to the Page | Redo Step 2 |
| `(#10) Application does not have permission` | Token is missing `instagram_basic` or `pages_read_engagement` | Redo Step 5 with the right scopes checked |
| `Invalid OAuth access token` | Token expired (User tokens last 1-2h) | Regenerate (Step 5) or extend to 60 days (Step 6) |
| Page Access Token "Never expires" but IG calls fail | App is in Development mode and you're not a Tester | App Dashboard → App Roles → Roles → add yourself |
| `ig_hashtag_search` returns empty for a hashtag | Hashtag may be rate-limited (30 unique per 7 days per user) | The project already caches hashtag IDs for 30 days. If you still hit limits, edit `BEAUTY_HASHTAGS` in `src/integrations/instagram.ts` |
| Hashtag search works but no `like_count` / `comments_count` | Some posts don't expose engagement counts publicly | Expected — engagement-score ranking falls back to whatever counts ARE returned |

---

## Why all of this is necessary

Instagram tightly controls access to its data. The chain is:

```
Personal IG account              ← no API access ever
       ↓ (convert)
Business IG account              ← can use Graph API
       ↓ (link to Facebook Page)
Page-linked IG Business Account  ← can be searched via hashtag API
       ↓ (Page Access Token with the right scopes)
You, programmatically            ← can call /ig_hashtag_search
```

Each link in the chain is a separate setup step. Skip any one and the whole thing fails with cryptic errors.

The TikTok Research API requires similar (but more restrictive) setup — you have to apply and be approved, which can take weeks.

---

## After this setup

The project's `searchBeautyReels` function will:

1. Read the seed hashtags from `BEAUTY_HASHTAGS` in [src/integrations/instagram.ts](../src/integrations/instagram.ts)
2. Look up each hashtag's ID (cached for 30 days in `kv_cache` table)
3. Fetch the top media for each hashtag via `/v22.0/{hashtag_id}/top_media`
4. Map results to the project's `ResearchResult` type
5. Score by engagement and return the top N

This runs whenever the daily research cron fires, or when you manually run `npm run cli -- research`.

If anything in this chain fails, the function transparently falls back to the mock dataset — your pipeline never breaks.
