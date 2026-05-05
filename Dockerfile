# Beauty Researcher — production container
# Image runs the long-lived cron scheduler. SQLite lives at /data so it survives
# container restarts when mounted to a persistent volume.

FROM node:20-slim AS deps
WORKDIR /app

# Install build tools for better-sqlite3 native binding.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ---- Runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app

# Runtime needs the sqlite3 shared lib loader, but not the build chain.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

# Persistent storage — mount a volume here in your platform's UI.
# Default DATABASE_URL writes here so SQLite survives restarts.
RUN mkdir -p /data
ENV DATABASE_URL=file:/data/beauty_research.db

# DRY_RUN defaults true; set to "false" in your platform's env vars to allow
# actual posting. Do NOT bake any API keys into the image — set them via the
# platform's secret manager.
ENV DRY_RUN=true
ENV LOG_LEVEL=info

# Long-running scheduler. Edit RESEARCH_CRON / REPORT_CRON env vars at runtime.
CMD ["npx", "tsx", "src/scheduler/index.ts"]
