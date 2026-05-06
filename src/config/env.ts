import "dotenv/config";

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  logLevel: str("LOG_LEVEL", "info"),
  niche: str("NICHE", "beauty care"),

  databaseUrl: str("DATABASE_URL", "file:./data/beauty_research.db"),

  llm: {
    provider: str("LLM_PROVIDER", "mock") as "anthropic" | "openai" | "mock",
    anthropicKey: str("ANTHROPIC_API_KEY"),
    anthropicModel: str("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    openaiKey: str("OPENAI_API_KEY"),
    openaiModel: str("OPENAI_MODEL", "gpt-4o-mini"),
  },

  research: {
    provider: str("RESEARCH_PROVIDER", "mock") as "mock" | "graph" | "apify",
  },

  social: {
    tiktokKey: str("TIKTOK_API_KEY"),
    tiktokSecret: str("TIKTOK_API_SECRET"),
    instagramToken: str("INSTAGRAM_ACCESS_TOKEN"),
    instagramAccountId: str("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
    youtubeKey: str("YOUTUBE_API_KEY"),
    redditId: str("REDDIT_CLIENT_ID"),
    redditSecret: str("REDDIT_CLIENT_SECRET"),
  },

  apify: {
    token: str("APIFY_TOKEN"),
    igActor: str("APIFY_IG_ACTOR", "apify/instagram-hashtag-scraper"),
    ttActor: str("APIFY_TT_ACTOR", "clockworks/free-tiktok-scraper"),
  },

  image: {
    provider: str("IMAGE_PROVIDER", "mock") as "openai" | "blotato" | "mock",
    apiKey: str("IMAGE_API_KEY"),
  },

  video: {
    provider: str("VIDEO_PROVIDER", "mock") as "creatomate" | "runway" | "pika" | "blotato" | "mock",
    creatomateKey: str("CREATOMATE_API_KEY"),
    runwayKey: str("RUNWAY_API_KEY"),
    pikaKey: str("PIKA_API_KEY"),
  },

  blotato: {
    apiKey: str("BLOTATO_API_KEY"),
    baseUrl: str("BLOTATO_BASE_URL", "https://backend.blotato.com/v2"),
    tiktokAccountId: str("BLOTATO_TIKTOK_ACCOUNT_ID"),
    instagramAccountId: str("BLOTATO_INSTAGRAM_ACCOUNT_ID"),
    youtubeAccountId: str("BLOTATO_YOUTUBE_ACCOUNT_ID"),
    defaultVideoTemplateId: str("BLOTATO_DEFAULT_VIDEO_TEMPLATE_ID"),
    publishViaBlotato: bool("PUBLISH_VIA_BLOTATO", false),
  },

  notify: {
    channel: str("NOTIFY_CHANNEL", "console") as "telegram" | "email" | "console",
    telegramToken: str("TELEGRAM_BOT_TOKEN"),
    telegramChatId: str("TELEGRAM_CHAT_ID"),
    // Optional comma-separated list of additional chat IDs that receive a
    // view-only copy of approval messages (no buttons; cannot approve).
    // Useful when you want collaborators to be informed but only one person decides.
    telegramViewerChatIds: str("TELEGRAM_VIEWER_CHAT_IDS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    emailFrom: str("EMAIL_FROM"),
    emailTo: str("EMAIL_TO"),
    smtpHost: str("SMTP_HOST"),
    smtpPort: Number(str("SMTP_PORT", "587")),
    smtpUser: str("SMTP_USER"),
    smtpPass: str("SMTP_PASS"),
  },

  schedule: {
    research: str("RESEARCH_CRON", "0 6 * * *"),
    report: str("REPORT_CRON", "0 9 */3 * *"),
    timezone: str("TIMEZONE", "UTC"),
  },

  dryRun: bool("DRY_RUN", true),
};

export type AppEnv = typeof env;
