# Welcome to Beauty Researcher 🌸

Hey! This is an AI agent that researches beauty-care trends on TikTok and Instagram, generates ready-to-publish posts (script, caption, video), and lets you approve them from your phone via Telegram before anything goes live.

This guide walks you through **everything**, step by step. No prior coding experience needed. If anything is unclear, ask.

---

## Two ways to get started

**Option A — just look at it** (5 minutes, no installs)
Open this in your browser: https://github.com/naor705/Beauty_project

You can read the code, the README, and the workflow diagrams. The diagrams render automatically — go to [`docs/WORKFLOW_DIAGRAM.md`](WORKFLOW_DIAGRAM.md) to see them. That's enough to understand what the project does.

**Option B — run it on your own machine** (45-60 min for the first setup, then it's instant)
Continue with the steps below.

---

## Step 1 — Install three free tools

You need:

1. **Node.js** (the engine that runs the project)
   - Go to https://nodejs.org
   - Click the big green **"LTS"** button (currently version 20 or 22)
   - Run the installer, click Next on everything, leave defaults
   - This also installs `npm`, which is what we'll use to install the project

2. **Git** (the tool that downloads the project from GitHub)
   - Go to https://git-scm.com/download/win
   - The download starts automatically
   - Run the installer, click Next on everything, leave defaults

3. **VS Code** (a code editor — recommended but optional)
   - Go to https://code.visualstudio.com
   - Download, install, leave defaults

*On Mac:* Install Node.js the same way; install Git via the Xcode Command Line Tools (run `xcode-select --install` in Terminal); VS Code link is the same.

**Verify everything installed:** Open PowerShell (Windows) or Terminal (Mac) and type:

```
node --version
git --version
```

Both should print a version number. If either fails, restart your computer (sometimes the PATH needs a reboot).

---

## Step 2 — Make a GitHub account and ask for access

1. Go to https://github.com/signup (free)
2. Pick a username, verify your email
3. Send the project owner your **GitHub username** so they can give you write access. You'll get an email invite — click "Accept invitation."

*(If you only want to view the code, you don't actually need an account — the project is set up so collaborators can edit, but anyone with the link can browse.)*

---

## Step 3 — Download the project to your computer

1. Open **PowerShell** (Windows: press `Win + X`, then click "Terminal" or "PowerShell")
2. Choose where to put the project. We'll use your Documents folder:

   ```
   cd Documents
   ```

3. Download the project (this is "cloning" in git-speak):

   ```
   git clone https://github.com/naor705/Beauty_project.git
   ```

4. Enter the project folder:

   ```
   cd Beauty_project
   ```

If git asks you to log in, use your GitHub username + a "Personal Access Token" instead of your password (GitHub doesn't accept passwords anymore for security):

- Go to https://github.com/settings/tokens
- Click **"Generate new token (classic)"**
- Note: `beauty-researcher`
- Scopes: check the box next to **`repo`**
- Click **"Generate token"** → copy the long string starting with `ghp_...`
- Paste that as your password when git asks

---

## Step 4 — Install the project's dependencies

Still in PowerShell, in the `Beauty_project` folder, run:

```
npm install
```

This downloads ~100MB of helper libraries. Takes 1-3 minutes. You'll see a lot of text scrolling — that's normal. When you see the prompt again (the line ending in `>`), it's done.

---

## Step 5 — Get your own API keys

Each person on the team should have **separate** API keys. Never share keys.

### 5a. Anthropic (Claude AI) — for generating scripts and captions

- Go to https://console.anthropic.com
- Sign up, add a credit card ($5 free trial usually)
- Go to **Settings → API Keys → Create Key**
- Name it: `beauty-researcher`
- **Copy the key immediately** (it's shown only once). It starts with `sk-ant-api03-...`
- Paste it somewhere safe (a password manager or a note on your computer)
- Cost: about **$0.05 per AI-generated content piece**

### 5b. Blotato — for rendering videos and publishing

- Go to https://my.blotato.com
- Sign up
- **Settings → API → Create Key**
- Copy the key starting with `blt_...`
- Cost: **about $0.30-1.00 per AI video render** (depends on your plan)

### 5c. Telegram bot — for one-tap approvals from your phone (optional but recommended)

- On Telegram, search for **@BotFather** and start a chat
- Send `/newbot`
- Pick a display name (e.g. `Yourname Beauty Bot`)
- Pick a username ending in `bot` (e.g. `yourname_beauty_bot`)
- BotFather sends you a **token** like `123456:ABC-DEF...` — copy it
- Open a chat with your new bot, tap **Start**
- You'll get your chat ID later via a CLI command
- Cost: **free**

---

## Step 6 — Configure the project with your keys

1. In the `Beauty_project` folder, copy the example config:

   ```
   copy .env.example .env
   ```

   (On Mac: `cp .env.example .env`)

2. Open the new `.env` file in VS Code:

   ```
   code .env
   ```

3. Find these lines and fill in your keys (paste your real keys, don't include the `<>` brackets):

   ```
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-api03-<your key here>

   VIDEO_PROVIDER=blotato
   BLOTATO_API_KEY=blt_<your key here>
   BLOTATO_DEFAULT_VIDEO_TEMPLATE_ID=/base/v2/ai-story-video/5903fe43-514d-40ee-a060-0d6628c5f8fd/v1

   NOTIFY_CHANNEL=telegram
   TELEGRAM_BOT_TOKEN=<your bot token from BotFather>

   DRY_RUN=true
   ```

4. **Save** the file (Ctrl+S in VS Code)

⚠ **NEVER share the contents of your `.env` file with anyone.** Don't paste it in chat, don't email it, don't put it in a git commit. The project is already configured to never accidentally upload it to GitHub.

---

## Step 7 — Initialize the database

Back in PowerShell:

```
npm run db:init
```

Quick — creates an empty SQLite database on your computer. You'll see "Database initialized" with a list of 8 tables.

---

## Step 8 — Get your Telegram chat ID (only if you set up Telegram)

```
npm run cli -- telegram-find-chat-id
```

It prints your chat ID (a number like `539033429`). Copy that into `.env` on the line:

```
TELEGRAM_CHAT_ID=<paste the number here>
```

Save the file.

---

## Step 9 — Run the demo!

```
npm run cli -- demo
```

Watch what happens:

- **Step 1-2** (instant): Researches mock TikTok/Instagram trends, generates a top-10 report with real Claude
- **Step 3** (instant): Picks the top trend
- **Step 4** (~90 seconds): Real Claude writes a script + caption + scenes; Blotato renders a real MP4 video
- **Step 5-7** (instant): Approves itself (in real use, you'd tap a button on Telegram instead) and "publishes" in DRY_RUN mode (logs only, doesn't actually post)

At the end, look for the `asset:` line — that's a real video URL you can open in your browser.

---

## What costs you money each time

| Action | Approximate cost |
|---|---|
| `npm run cli -- demo` | $0.05 (Claude) + 1 Blotato video render (~$0.30-1.00) |
| `npm run cli -- research` | $0 (uses mock data for now) |
| `npm run cli -- report` | $0.05 (10 Claude calls) |
| `npm run cli -- telegram-bot` (idle) | $0 |
| Tapping ✅ Approve / ❌ Reject on Telegram | $0 |

Nothing actually posts to TikTok/Instagram while `DRY_RUN=true` is in your `.env`. Keep it that way until you're ready.

---

## How to view the workflow

Open `docs/workflow-diagrams.html` from File Explorer (in the project folder) by double-clicking it. It opens in your browser with all the workflow diagrams rendered as images. Or browse the project on GitHub at https://github.com/naor705/Beauty_project/blob/main/docs/WORKFLOW_DIAGRAM.md.

---

## Other useful commands

```
npm run cli -- top                # see the most engaging stored trends
npm run cli -- reports            # list all reports we've generated
npm run cli -- show-report latest # full text of the latest report
npm run cli -- selections         # which trends we've picked to make content from
npm run cli -- pending-approvals  # what's waiting on you
```

---

## If something goes wrong

| Problem | Fix |
|---|---|
| `'npm' is not recognized` | Restart your computer after installing Node.js |
| `'git' is not recognized` | Restart your computer after installing Git |
| `Cannot find module 'tsx'` | Run `npm install` again |
| `401 invalid x-api-key` | Your Anthropic key is wrong — re-copy from console.anthropic.com |
| Bot doesn't reply on Telegram | Run `npm run cli -- telegram-test` to verify token + chat ID |
| Anything else | Screenshot the error, ask for help |

---

## How to keep up with new changes

Whenever someone pushes new code, you can pull it down with:

```
git pull
```

Run that before you start working each day. If `git pull` says you have local changes, just save your work first with:

```
git stash
git pull
git stash pop
```

When **you** make changes you want others to see:

```
git add .
git commit -m "describe what you changed"
git push
```

---

## Documentation

All in the `docs/` folder of the project:

- **[README.md](../README.md)** — overview
- **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** — how the system is built
- **[docs/WORKFLOW.md](WORKFLOW.md)** — step-by-step user journey
- **[docs/WORKFLOW_DIAGRAM.md](WORKFLOW_DIAGRAM.md)** — visual diagrams
- **[docs/DEPLOY.md](DEPLOY.md)** — how to keep it running 24/7
- **[docs/TELEGRAM.md](TELEGRAM.md)** — Telegram bot setup
- **[docs/DATABASE.md](DATABASE.md)** — what's stored where
- **[docs/ROADMAP.md](ROADMAP.md)** — what we're building next

Welcome aboard! 🌸
