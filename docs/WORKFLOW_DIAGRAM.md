# Workflow diagrams (for demo)

Three views of the same system, optimized for a meeting audience.

> **How to show these in your meeting:**
> - **Easiest:** open this page on GitHub — every diagram renders automatically as an interactive image. Share screen and zoom. URL: https://github.com/naor705/Beauty_project/blob/main/docs/WORKFLOW_DIAGRAM.md
> - **For slides (PNG/SVG):** copy any diagram's code block (everything between ` ```mermaid ` and ` ``` `), paste into **https://mermaid.live**, click **Actions → Download PNG/SVG**, embed in your slide.
> - **In VS Code:** install the "Markdown Preview Mermaid Support" extension, then preview this file (Ctrl+Shift+V).

---

## 1. The Big Picture — what the system does

The simple 5-step story for a non-technical audience.

```mermaid
flowchart LR
    A([🔍 Research<br/>TikTok + Instagram<br/>beauty trends])
    B([📊 Analyze<br/>top 10 trends<br/>every 3 days])
    C([✍️ Generate<br/>script + caption +<br/>video for chosen trend])
    D([📱 Approve<br/>tap on phone<br/>via Telegram])
    E([🚀 Publish<br/>TikTok + Instagram<br/>at scheduled time])

    A --> B --> C --> D --> E

    classDef step fill:#FCE4EC,stroke:#C2185B,stroke-width:2px,color:#000;
    class A,B,C,D,E step;
```

**Key idea:** AI does the heavy lifting (research + creation), human approves from phone, posts go out automatically.

---

## 2. End-to-end Pipeline — what happens when

Shows the four layers of the system, what's automatic vs. what waits for you.

```mermaid
flowchart TB
    subgraph L1[" 🟢 LAYER 1 — Automated (cron, daily) "]
        direction LR
        Cron1[/⏰ Daily/]
        Cron1 --> Res[Research Agent]
        Res -->|RESEARCH_PROVIDER| Apify[🌐 Apify scrapers]
        Apify -->|hashtag scraper| TT[(TikTok)]
        Apify -->|hashtag scraper| IG[(Instagram)]
        Res -.->|or graph API| IG
        Res --> ResultsDB[(💾 research_results<br/>+ kv_cache)]
    end

    subgraph L2[" 🟡 LAYER 2 — Automated (cron, every 3 days) "]
        direction LR
        Cron2[/⏰ Every 3 days/]
        Cron2 --> Trend[Trend Analysis Agent]
        Trend -->|rank top 10| ResultsDB
        Trend -->|generate insights| Anthropic1[🤖 Claude]
        Trend --> ReportDB[(💾 trend_reports)]
    end

    subgraph L3[" 🔵 LAYER 3 — Human picks, AI generates "]
        direction LR
        ReportDB --> Pick{User picks<br/>which trend}
        Pick --> Content[Content Agent]
        Content -->|hook + caption +<br/>script + scenes| Anthropic2[🤖 Claude]
        Content -->|render video| Blotato1[🎬 Blotato]
        Content --> ContentDB[(💾 generated_content)]
    end

    subgraph L4[" 🟣 LAYER 4 — Human approves, system publishes "]
        direction LR
        ContentDB --> ApReq[Approval Request]
        ApReq -->|push| TG[💬 Telegram Bot]
        TG --> Phone((📱 You))
        Phone -->|tap ✅ or ❌| Decide{Approved?}
        Decide -->|❌ Reject| Done1[🚫 Discarded]
        Decide -->|✅ Approve| Schedule[(💾 scheduled_posts)]
        Schedule -->|when due| PubTick[Publisher Tick<br/>every minute]
        PubTick -->|publish| Blotato2[🎬 Blotato]
        Blotato2 --> Live[(🌐 TikTok + Instagram)]
    end

    L1 --> L2 --> L3 --> L4

    classDef auto fill:#E8F5E9,stroke:#2E7D32,color:#000;
    classDef report fill:#FFF8E1,stroke:#F9A825,color:#000;
    classDef human fill:#E3F2FD,stroke:#1565C0,color:#000;
    classDef publish fill:#F3E5F5,stroke:#6A1B9A,color:#000;
    class L1 auto;
    class L2 report;
    class L3 human;
    class L4 publish;
```

**Talking points for the meeting:**
- 🟢 + 🟡 happen on a schedule with **zero human input**
- 🔵 is the only step where you decide *what* to make
- 🟣 is **gated by your tap** — nothing posts without explicit approval

---

## 3. The Approval UX — the moment that matters

Shows the back-and-forth between system and human at approval time. This is the slide that closes the demo.

```mermaid
sequenceDiagram
    autonumber
    participant Sys as 🔧 Beauty Researcher
    participant LLM as 🤖 Claude (Anthropic)
    participant Vid as 🎬 Blotato
    participant TG as 💬 Telegram
    participant You as 📱 You (anywhere)

    Sys->>LLM: Generate hook, caption,<br/>script, scenes for trend
    LLM-->>Sys: Original content pack
    Sys->>Vid: Render 9:16 vertical video<br/>from script + scenes
    Vid-->>Sys: MP4 URL (~90 sec)

    Sys->>TG: Send approval message<br/>with ✅ / ❌ buttons
    TG->>You: 🔔 Push notification

    Note over You: You read the<br/>script + caption,<br/>watch the video URL

    You->>TG: Tap ✅ Approve

    TG->>Sys: callback_query<br/>(approve:approval_id)
    Sys->>Sys: Update DB:<br/>status = approved
    Sys->>TG: Edit message:<br/>"✅ APPROVED at 18:52"

    Note over Sys: Cron tick every minute<br/>checks for due posts

    Sys->>Vid: Submit post<br/>to TikTok + Instagram
    Vid-->>Sys: Submission IDs

    Note over Sys,You: Done. Post lives<br/>on your channels.
```

**Demo line:** *"From discovering a viral trend to a published post on TikTok and Instagram — the only thing that touched a human was one tap on the phone."*

---

## 4. Tech Stack (for technical audience)

If anyone in the meeting is technical and asks "what's under the hood":

```mermaid
flowchart TB
    subgraph Apis["External APIs"]
        AntropicAPI["🤖 Anthropic Claude<br/>summaries, scripts, captions"]
        BlotatoAPI["🎬 Blotato<br/>video render + multi-platform publish"]
        TGAPI["💬 Telegram Bot API<br/>approval inbox"]
        ApifyAPI["🌐 Apify<br/>IG + TikTok hashtag scraping<br/>(active research source)"]
        IGAPI["📷 Instagram Graph API<br/>(alternative research, optional)"]
        TTAPI["🎵 TikTok Research API<br/>(alternative research, optional)"]
    end

    subgraph Core["Beauty Researcher  •  Node.js + TypeScript + SQLite"]
        Sched["⏰ Scheduler<br/>(node-cron)"]
        Agents["Agents:<br/>research • trend-analysis<br/>content • publishing<br/>approval • telegram-bot"]
        DB["💾 SQLite<br/>research_results · trend_reports<br/>generated_content · approval_requests<br/>scheduled_posts · post_logs · kv_cache"]
        MCP["🔌 MCP Tool Registry<br/>(13 tool contracts<br/>ready for n8n / Claude SDK)"]
    end

    subgraph UX["User-facing"]
        CLI["💻 CLI<br/>(40+ commands)"]
        Bat["🖱️ .bat launchers<br/>double-click on desktop"]
        Phone["📱 Telegram bot<br/>tap to approve"]
        Cloud["☁️ Railway-ready<br/>(Dockerfile + railway.toml)"]
    end

    Sched --> Agents
    Agents --> AntropicAPI
    Agents --> BlotatoAPI
    Agents --> ApifyAPI
    Agents -.-> IGAPI
    Agents -.-> TTAPI
    Agents <--> DB
    Agents --> TGAPI
    MCP --> Agents
    CLI --> Agents
    Bat --> CLI
    Phone <--> TGAPI

    classDef ext fill:#FFF3E0,stroke:#E65100,color:#000;
    classDef core fill:#E1F5FE,stroke:#0277BD,color:#000;
    classDef ux fill:#F1F8E9,stroke:#558B2F,color:#000;
    class Apis ext;
    class Core core;
    class UX ux;
```

---

## How to export for slides — step by step

1. Pick the diagram you want
2. Copy everything between ` ```mermaid ` and the closing ` ``` ` (just the diagram code)
3. Open **https://mermaid.live** in your browser
4. Paste the code into the left panel — it renders instantly on the right
5. Click **Actions** (top-right of the right panel) → **Download PNG** (high-res) or **Download SVG** (scalable)
6. Drag the downloaded file into your Google Slides / PowerPoint / Keynote

**Pro tip:** SVG is better for slides because it scales without pixelation. PNG works everywhere.

## Customizing the diagrams

These are plain text — change a label, add a node, swap colors. After editing this file:

```powershell
git add docs/WORKFLOW_DIAGRAM.md
git commit -m "Update workflow diagrams"
git push
```

GitHub re-renders within a few seconds. The mermaid.live editor also has a live preview you can iterate on without committing.
