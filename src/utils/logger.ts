import { env } from "../config/env.js";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function active(level: Level): boolean {
  const min = (order as Record<string, number>)[env.logLevel] ?? order.info;
  return order[level] >= min;
}

function fmt(level: Level, scope: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const tag = `[${ts}] ${level.toUpperCase().padEnd(5)} ${scope}:`;
  if (meta === undefined) return `${tag} ${msg}`;
  try {
    return `${tag} ${msg} ${JSON.stringify(meta)}`;
  } catch {
    return `${tag} ${msg}`;
  }
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, meta?: unknown) => active("debug") && console.log(fmt("debug", scope, m, meta)),
    info: (m: string, meta?: unknown) => active("info") && console.log(fmt("info", scope, m, meta)),
    warn: (m: string, meta?: unknown) => active("warn") && console.warn(fmt("warn", scope, m, meta)),
    error: (m: string, meta?: unknown) => active("error") && console.error(fmt("error", scope, m, meta)),
  };
}

export type Logger = ReturnType<typeof createLogger>;
