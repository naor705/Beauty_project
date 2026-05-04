# Architecture

```
                        ┌─────────────────┐
                        │  Scheduler      │  cron: daily, 3-day, per-minute
                        └────────┬────────┘
                                 │
                                 ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ ResearchAgent    │→ │ TrendAnalysis    │→ │ ContentAgent     │→ │ PublishingAgent  │
   │ tiktok / ig /    │  │ rank top-10      │  │ image / caption  │  │ DRY_RUN gate +   │
   │ youtube / reddit │  │ per-trend insight│  │ faceless / gen.  │  │ approval re-check│
   └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
            │                     │                     │                     │
            ▼                     ▼                     ▼                     ▼
    research_results       trend_reports          generated_content      scheduled_posts
                           trend_insights         + approval_requests    + post_logs
                                                          │
                                                          ▼
                                                  ApprovalFlow ─→ Notify (telegram/email/console)
                                                          │
                                                  human approves/rejects
                                                          │
                                                          ▼
                                                 PublishingAgent
```

## Layers

| Layer | Purpose | Files |
| --- | --- | --- |
| `config/` | env loading, typed | `env.ts` |
| `types/` | shared TS types for every entity | `index.ts` |
| `db/` | SQLite client + repositories (one per domain) | `client.ts`, `schema.sql`, `repositories/*` |
| `integrations/` | external APIs (mocked) | `tiktok.ts`, `instagram.ts`, `llm.ts`, `image-gen.ts`, `video-gen.ts`, `notify.ts`, `optional-sources.ts` |
| `agents/` | orchestrate multi-step jobs | `research-agent.ts`, `trend-analysis-agent.ts`, `content-agent.ts`, `approval-flow.ts`, `publishing-agent.ts` |
| `mcp/` | tool contracts + lightweight server | `tools.ts`, `server.ts` |
| `scheduler/` | cron jobs | `index.ts` |
| `cli/` | manual driver for the whole pipeline | `index.ts` |

## Design choices

- **SQLite first, Postgres-ready.** The repositories return plain typed objects. To migrate, swap `client.ts` for `pg` and translate the schema (UUID for ids, JSONB for the JSON columns).
- **Agents are pure functions over the DB.** No global state, no in-memory queues. The scheduler is a thin trigger; everything is restartable.
- **Mock-first integrations.** Every external API has a deterministic mock that produces realistic shapes. `TODO(real)` markers point to the exact endpoint to wire when credentials arrive.
- **MCP-ready, MCP-light.** The tool registry in `src/mcp/tools.ts` is the single source of truth for all capabilities. The current server is a tiny stdin JSON loop; replace with `@modelcontextprotocol/sdk` once external clients show up.
- **Approval is enforced twice.** Once in `approval-flow.ts` before scheduling, again in `publishing-agent.ts` at publish time. Even race conditions can't slip a rejection past.
- **n8n compatibility.** The MCP tool contracts map 1:1 to n8n function nodes. Each tool's input schema is a JSON Schema, so `n8n` workflows can call them directly via the `Execute Command` or HTTP node once an HTTP transport is added.
