# Running the project

Three ways, ordered by least to most setup. Pick whichever fits.

| Method | Best for | What stays on |
|---|---|---|
| **1. Double-click `.bat`** | One-off manual runs | Nothing — runs and exits |
| **2. Windows Task Scheduler** | Hands-off on your laptop | Your laptop must be powered on for the cron to fire |
| **3. Cloud (Railway)** | True 24/7 — runs even when your laptop is off | A small monthly server bill ($0–$5) |

---

## 1. Double-click launchers (any machine)

Four `.bat` files at the project root. Double-click any of them in File Explorer:

| File | What it runs |
|---|---|
| `run-demo.bat` | Full pipeline (research → report → generate → approve → schedule → publish DRY_RUN) |
| `run-research.bat` | One research pass across configured sources |
| `run-report.bat` | The 3-day top-10 trend report |
| `run-scheduler.bat` | Starts the in-app cron scheduler. Window stays open until you close it. |

Each `.bat` will auto-`npm install` on first run and auto-init the database.

**Make a desktop shortcut:** right-click the `.bat` → "Send to → Desktop (create shortcut)". Now you can launch from the desktop without opening File Explorer.

**Cost:** $0. Runs locally with whatever providers you have configured in `.env`.

---

## 2. Windows Task Scheduler (always-on while your laptop is on)

Registers the in-app scheduler to start automatically at login. The actual cron timing (when research runs, when reports generate, when posts publish) lives in `.env` — Task Scheduler just keeps the scheduler **process** alive.

### Install once

Open PowerShell **as your normal user** (not admin) in the project folder:

```powershell
pwsh ./scripts/register-scheduler-task.ps1
# or, if pwsh isn't installed:
powershell -ExecutionPolicy Bypass -File ./scripts/register-scheduler-task.ps1
```

You'll see:
```
Registered scheduled task: BeautyResearcher_Scheduler
  Trigger:     at user login (30s delay)
  ...
```

### Set the schedule

Edit your `.env` file (the timing was deliberately left flexible — choose when *you* want jobs to run):

```env
# Research job — when to scrape new trend signals.
# Default below = every day at 06:00 UTC. Change to whatever you want.
# Cron format: "minute hour day-of-month month day-of-week"
RESEARCH_CRON=0 6 * * *

# Trend report — when to generate the top-10 + insights.
# Default = at 09:00 UTC every 3 days.
REPORT_CRON=0 9 */3 * *

# Timezone (IANA name) for the cron expressions above.
TIMEZONE=UTC
```

Common cron examples:

| What you want | `RESEARCH_CRON` |
|---|---|
| Every day at 8am your local time | `0 8 * * *` (with `TIMEZONE=Asia/Jerusalem` or similar) |
| Twice a day, 9am + 9pm | `0 9,21 * * *` |
| Every 4 hours | `0 */4 * * *` |
| Weekdays only at noon | `0 12 * * 1-5` |

After editing `.env`, restart the task so it picks up the new values:

```powershell
Stop-ScheduledTask -TaskName BeautyResearcher_Scheduler
Start-ScheduledTask -TaskName BeautyResearcher_Scheduler
```

### Manage the task

```powershell
# Start it now (without waiting for next login):
Start-ScheduledTask -TaskName BeautyResearcher_Scheduler

# Stop it:
Stop-ScheduledTask -TaskName BeautyResearcher_Scheduler

# See its status:
Get-ScheduledTask -TaskName BeautyResearcher_Scheduler

# Remove it entirely:
pwsh ./scripts/unregister-scheduler-task.ps1
```

You can also open the GUI: `Win+R` → `taskschd.msc` → Task Scheduler Library → `BeautyResearcher_Scheduler`.

**Limitation:** runs only when your laptop is on. If you close the lid, it pauses. For 24/7 → use Cloud (option 3).

---

## 3. Cloud — Railway (24/7, $0–$5/month)

Railway is the easiest cloud platform to deploy this to. It builds the Dockerfile, attaches a persistent volume for the SQLite database, and runs the scheduler 24/7. Free tier includes $5 of monthly usage which is enough for this MVP.

### One-time setup

1. Sign up at **https://railway.app** (use your GitHub login)
2. Click **New Project** → **Deploy from GitHub repo** → select `naor705/Beauty_project`
3. Railway detects the `Dockerfile` and starts building

### Add a persistent volume (so SQLite survives restarts)

Without this, every container restart wipes your `research_results`, `trend_reports`, etc.

1. In your Railway project → click your service → **Settings** → **Volumes**
2. **Add Volume**
3. Mount path: `/data`
4. Size: `1 GB` (plenty for years of data)

### Set environment variables

In your Railway service → **Variables** → **+ New Variable**, add each:

| Variable | Value | Notes |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | **Paste in Railway, never in chat** |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | |
| `VIDEO_PROVIDER` | `blotato` | |
| `BLOTATO_API_KEY` | `blt_...` | **Paste in Railway, never in chat** |
| `BLOTATO_DEFAULT_VIDEO_TEMPLATE_ID` | (your template ID) | from `npm run cli -- templates` |
| `RESEARCH_CRON` | `0 6 * * *` | or whatever schedule you want |
| `REPORT_CRON` | `0 9 */3 * *` | |
| `TIMEZONE` | `UTC` | or your IANA timezone |
| `DRY_RUN` | `true` | flip to `false` only when ready to actually post |
| `PUBLISH_VIA_BLOTATO` | `false` | flip to `true` to use Blotato for posting |
| `BLOTATO_TIKTOK_ACCOUNT_ID` | (from Blotato dashboard) | only if publishing |
| `BLOTATO_INSTAGRAM_ACCOUNT_ID` | (from Blotato dashboard) | only if publishing |
| `NICHE` | `beauty care` | |

Railway redeploys automatically after each variable change.

### Verify it's running

In Railway → your service → **Deployments** → click the latest → **View Logs**. You should see:

```
[scheduler] scheduler starting { research: '0 6 * * *', report: '0 9 */3 * *', tz: 'UTC' }
[scheduler] scheduler running. Ctrl-C to stop.
```

The scheduler is now running 24/7. It'll fire research at the time you set, generate reports on the cadence you set, and execute scheduled posts the minute they're due.

### Trigger jobs manually from the cloud

Use Railway's **Service → Execute Command** (or `railway run` from CLI) to run any CLI command:

```bash
railway run npm run cli -- demo
railway run npm run cli -- top
railway run npm run cli -- show-report latest
```

### Cost expectations

- **Compute:** ~$3–5/month for an always-on small container
- **Volume:** ~$0.25/GB-month
- **Bandwidth:** included
- **Anthropic + Blotato:** same as local, billed by them directly

The free $5 tier covers the small container most months.

### Alternative: managed Postgres instead of SQLite

If you want a "real" database (concurrent reads/writes, automatic backups, separate from the app container), Railway offers Postgres:

1. In your project → **+ New** → **Database** → **PostgreSQL**
2. In your service → **Variables** → add `DATABASE_URL` referencing the Postgres connection string
3. Update [src/db/client.ts](../src/db/client.ts) to use `pg` instead of `better-sqlite3` (TODO; not yet implemented — see [docs/DATABASE.md](DATABASE.md) for the migration guide)

Not necessary for MVP — SQLite on a mounted volume is fine.

---

## Switching between methods

You can have all three set up simultaneously without conflict — they each operate on independent state:

- `.bat` files use your local `data/beauty_research.db`
- Task Scheduler also uses your local `data/beauty_research.db` (same DB, just runs scheduled)
- Railway uses the cloud volume's `/data/beauty_research.db` (separate DB on the server)

If you want your local DB and cloud DB to share data, that's a sync problem outside the MVP scope. Pick one as your "production" deployment.
