import type { Request } from "express";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  socketId?: string;
  [key: string]: unknown;
}

interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: unknown;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[MIN_LOG_LEVEL];
}

function emit(level: LogLevel, source: string, message: string, ctx?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    ...ctx,
  };

  const tag = `[${source}]`;
  const json = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(tag, json);
      break;
    case "warn":
      console.warn(tag, json);
      break;
    case "debug":
      console.debug(tag, json);
      break;
    default:
      console.log(tag, json);
  }
}

export function createLogger(source: string) {
  return {
    debug(message: string, ctx?: LogContext) {
      emit("debug", source, message, ctx);
    },
    info(message: string, ctx?: LogContext) {
      emit("info", source, message, ctx);
    },
    warn(message: string, ctx?: LogContext) {
      emit("warn", source, message, ctx);
    },
    error(message: string, ctx?: LogContext) {
      emit("error", source, message, ctx);
    },
  };
}

export function ctxFromReq(req: Request): LogContext {
  return {
    requestId: req.requestId || undefined,
    tenantId:
      req.tenant?.effectiveTenantId ||
      req.tenant?.tenantId ||
      req.user?.tenantId ||
      undefined,
    userId: req.user?.id || undefined,
  };
}

export function perfMark(): bigint {
  return process.hrtime.bigint();
}

export function perfMs(start: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - start) / 1_000_000 * 100) / 100;
}

export function apiPerfLog(
  logger: ReturnType<typeof createLogger>,
  label: string,
  start: bigint,
  ctx?: LogContext
): void {
  const durationMs = perfMs(start);
  logger.info(`${label} completed`, { ...ctx, durationMs, perfLabel: label });
}
