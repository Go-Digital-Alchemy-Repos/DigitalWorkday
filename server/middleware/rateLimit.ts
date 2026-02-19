/**
 * Rate Limiting Middleware using express-rate-limit
 * 
 * Purpose: Protect auth endpoints and file uploads from brute force/abuse
 * 
 * Key Invariants:
 * - Rate limiting is enabled by default in production
 * - Rate limiting is disabled by default in development for convenience
 * - All limits are configurable via environment variables
 * - Tenant-scoped keying ensures fair limits per tenant in multi-tenant mode
 * - All rate limit events are logged via structured logger
 * 
 * Architecture:
 * - RateLimitStore interface enables pluggable backends (in-memory default, Redis future)
 * - InMemoryRateLimitStore handles cleanup via periodic sweep
 * - Tenant ID is extracted from req.user when available for scoped rate limits
 * 
 * Sharp Edges:
 * - Uses in-memory store; limits reset on server restart
 * - Set RATE_LIMIT_DEV_ENABLED=true to test rate limiting in development
 * - To use a custom store, call setRateLimitStore() before server starts
 */

import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import { createLogger, ctxFromReq } from "../lib/logger";

const rlLog = createLogger("rate-limit");

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
  clear(): void;
  cleanup(): void;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 60000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  cleanup(): void {
    const now = Date.now();
    this.store.forEach((entry, key) => {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    });
  }

  get size(): number {
    return this.store.size;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

let activeStore: RateLimitStore = new InMemoryRateLimitStore();

export function setRateLimitStore(store: RateLimitStore): void {
  activeStore.clear();
  activeStore = store;
}

export function getRateLimitStore(): RateLimitStore {
  return activeStore;
}

const RATE_LIMIT_LOGIN_WINDOW_MS = parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS || "60000", 10);
const RATE_LIMIT_LOGIN_MAX_IP = parseInt(process.env.RATE_LIMIT_LOGIN_MAX_IP || "10", 10);
const RATE_LIMIT_LOGIN_MAX_EMAIL = parseInt(process.env.RATE_LIMIT_LOGIN_MAX_EMAIL || "5", 10);

const RATE_LIMIT_BOOTSTRAP_WINDOW_MS = parseInt(process.env.RATE_LIMIT_BOOTSTRAP_WINDOW_MS || "60000", 10);
const RATE_LIMIT_BOOTSTRAP_MAX_IP = parseInt(process.env.RATE_LIMIT_BOOTSTRAP_MAX_IP || "5", 10);

const RATE_LIMIT_INVITE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_INVITE_WINDOW_MS || "60000", 10);
const RATE_LIMIT_INVITE_MAX_IP = parseInt(process.env.RATE_LIMIT_INVITE_MAX_IP || "10", 10);

const RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS = parseInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS || "60000", 10);
const RATE_LIMIT_FORGOT_PASSWORD_MAX_IP = parseInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX_IP || "5", 10);
const RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL = parseInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL || "3", 10);

const RATE_LIMIT_UPLOAD_WINDOW_MS = parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || "60000", 10);
const RATE_LIMIT_UPLOAD_MAX_IP = parseInt(process.env.RATE_LIMIT_UPLOAD_MAX_IP || "30", 10);

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== "false";
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const DEV_ENABLED = process.env.RATE_LIMIT_DEV_ENABLED === "true";

function shouldSkipRateLimit(): boolean {
  if (!RATE_LIMIT_ENABLED) return true;
  if (IS_DEVELOPMENT && !DEV_ENABLED) return true;
  return false;
}

function getReqId(req: Request): string {
  return req.requestId || "unknown";
}

function getTenantScope(req: Request): string {
  const user = req.user as any;
  if (user?.tenantId) return `t:${user.tenantId}`;
  return "global";
}

function buildScopedKey(prefix: string, identifier: string, req?: Request): string {
  const scope = req ? getTenantScope(req) : "global";
  return `${scope}:${prefix}:${identifier}`;
}

function logRateLimitHit(req: Request, limiterName: string, extra?: Record<string, unknown>): void {
  rlLog.warn("Rate limit triggered", {
    ...ctxFromReq(req),
    limiter: limiterName,
    ip: req.ip,
    path: req.path,
    method: req.method,
    ...extra,
  });
}

function rateLimitHandler(limiterName: string, message: string) {
  return (req: Request, res: Response) => {
    const requestId = getReqId(req);
    logRateLimitHit(req, limiterName);
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message,
        requestId,
      },
    });
  };
}

const emailStore = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  emailStore.forEach((entry, key) => {
    if (entry.resetAt <= now) {
      emailStore.delete(key);
    }
  });
}

setInterval(cleanupExpiredEntries, 60000);

function checkEmailRateLimit(
  email: string,
  maxRequests: number,
  windowMs: number,
  keyPrefix: string,
  req?: Request
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = buildScopedKey(keyPrefix, email, req);
  const entry = activeStore.get(key) || emailStore.get(`${keyPrefix}:${email}`);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    const newEntry = { count: 1, resetAt };
    activeStore.set(key, newEntry);
    emailStore.set(`${keyPrefix}:${email}`, newEntry);
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

function createEmailRateLimiter(
  maxRequestsPerEmail: number,
  windowMs: number,
  keyPrefix: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipRateLimit()) return next();
    if (maxRequestsPerEmail <= 0) return next();
    
    const email = req.body?.email?.toLowerCase?.();
    if (!email) return next();

    const emailCheck = checkEmailRateLimit(email, maxRequestsPerEmail, windowMs, keyPrefix, req);
    
    if (!emailCheck.allowed) {
      const requestId = getReqId(req);
      const retryAfter = Math.ceil((emailCheck.resetAt - Date.now()) / 1000);
      
      logRateLimitHit(req, `${keyPrefix}:email`, {
        emailPrefix: email.substring(0, 3) + "***",
        retryAfter,
      });
      
      res.setHeader("Retry-After", retryAfter.toString());
      return res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests for this email. Please try again later.",
          requestId,
          retryAfter,
        },
      });
    }

    next();
  };
}

function createCombinedRateLimiter(
  windowMs: number,
  maxRequestsPerIP: number,
  maxRequestsPerEmail: number,
  keyPrefix: string
) {
  const ipLimiter = rateLimit({
    windowMs,
    max: maxRequestsPerIP,
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkipRateLimit,
    validate: { xForwardedForHeader: false },
    handler: rateLimitHandler(`${keyPrefix}:ip`, "Too many requests. Please try again later."),
  });

  const emailLimiter = createEmailRateLimiter(maxRequestsPerEmail, windowMs, keyPrefix);

  return (req: Request, res: Response, next: NextFunction) => {
    ipLimiter(req, res, (err?: any) => {
      if (err || res.headersSent) return;
      emailLimiter(req, res, next);
    });
  };
}

export const loginRateLimiter = createCombinedRateLimiter(
  RATE_LIMIT_LOGIN_WINDOW_MS,
  RATE_LIMIT_LOGIN_MAX_IP,
  RATE_LIMIT_LOGIN_MAX_EMAIL,
  "login"
);

export const bootstrapRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_BOOTSTRAP_WINDOW_MS,
  max: RATE_LIMIT_BOOTSTRAP_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: rateLimitHandler("bootstrap", "Too many registration attempts. Please try again later."),
});

export const inviteAcceptRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_INVITE_WINDOW_MS,
  max: RATE_LIMIT_INVITE_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: rateLimitHandler("invite-accept", "Too many invite acceptance attempts. Please try again later."),
});

export const forgotPasswordRateLimiter = createCombinedRateLimiter(
  RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS,
  RATE_LIMIT_FORGOT_PASSWORD_MAX_IP,
  RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL,
  "forgot"
);

export const uploadRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_UPLOAD_WINDOW_MS,
  max: RATE_LIMIT_UPLOAD_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: rateLimitHandler("upload", "Too many upload requests. Please try again later."),
});

const RATE_LIMIT_INVITE_CREATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_INVITE_CREATE_WINDOW_MS || "60000", 10);
const RATE_LIMIT_INVITE_CREATE_MAX_IP = parseInt(process.env.RATE_LIMIT_INVITE_CREATE_MAX_IP || "20", 10);

export const inviteCreateRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_INVITE_CREATE_WINDOW_MS,
  max: RATE_LIMIT_INVITE_CREATE_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: rateLimitHandler("invite-create", "Too many invite requests. Please try again later."),
});

const RATE_LIMIT_USER_CREATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_USER_CREATE_WINDOW_MS || "60000", 10);
const RATE_LIMIT_USER_CREATE_MAX_IP = parseInt(process.env.RATE_LIMIT_USER_CREATE_MAX_IP || "10", 10);

export const userCreateRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_USER_CREATE_WINDOW_MS,
  max: RATE_LIMIT_USER_CREATE_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: rateLimitHandler("user-create", "Too many user creation requests. Please try again later."),
});

const RATE_LIMIT_CHAT_SEND_WINDOW_MS = parseInt(process.env.RATE_LIMIT_CHAT_SEND_WINDOW_MS || "10000", 10);
const RATE_LIMIT_CHAT_SEND_MAX_IP = parseInt(process.env.RATE_LIMIT_CHAT_SEND_MAX_IP || "30", 10);

export const chatSendRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CHAT_SEND_WINDOW_MS,
  max: RATE_LIMIT_CHAT_SEND_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: rateLimitHandler("chat-send", "Too many messages. Please slow down."),
});

const RATE_LIMIT_CLIENT_MSG_WINDOW_MS = parseInt(process.env.RATE_LIMIT_CLIENT_MSG_WINDOW_MS || "10000", 10);
const RATE_LIMIT_CLIENT_MSG_MAX_IP = parseInt(process.env.RATE_LIMIT_CLIENT_MSG_MAX_IP || "20", 10);

export const clientMessageRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CLIENT_MSG_WINDOW_MS,
  max: RATE_LIMIT_CLIENT_MSG_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: rateLimitHandler("client-message", "Too many messages. Please slow down."),
});

export function resetRateLimitStores(): void {
  emailStore.clear();
  activeStore.clear();
}

export interface CreateRateLimiterOptions {
  windowMs: number;
  maxRequestsPerIP: number;
  maxRequestsPerEmail: number;
  keyPrefix: string;
}

export function createRateLimiter(options: CreateRateLimiterOptions) {
  const { windowMs, maxRequestsPerIP, maxRequestsPerEmail, keyPrefix } = options;

  const ipLimiter = rateLimit({
    windowMs,
    max: maxRequestsPerIP,
    standardHeaders: true,
    legacyHeaders: true,
    validate: { xForwardedForHeader: false },
    handler: (req: Request, res: Response) => {
      const requestId = getReqId(req);
      const retryAfter = Math.ceil(windowMs / 1000);
      logRateLimitHit(req, `${keyPrefix}:ip`, { retryAfter });
      res.setHeader("Retry-After", retryAfter.toString());
      res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          requestId,
          retryAfter,
        },
      });
    },
  });

  const emailLimiterMw = (req: Request, res: Response, next: NextFunction) => {
    if (maxRequestsPerEmail <= 0) return next();
    const email = req.body?.email?.toLowerCase?.();
    if (!email) return next();
    const emailCheck = checkEmailRateLimit(email, maxRequestsPerEmail, windowMs, keyPrefix, req);
    if (!emailCheck.allowed) {
      const requestId = getReqId(req);
      const retryAfter = Math.ceil((emailCheck.resetAt - Date.now()) / 1000);
      logRateLimitHit(req, `${keyPrefix}:email`, {
        emailPrefix: email.substring(0, 3) + "***",
        retryAfter,
      });
      res.setHeader("Retry-After", retryAfter.toString());
      return res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests for this email. Please try again later.",
          requestId,
          retryAfter,
        },
      });
    }
    next();
  };

  return (req: Request, res: Response, next: NextFunction) => {
    ipLimiter(req, res, (err?: any) => {
      if (err || res.headersSent) return;
      emailLimiterMw(req, res, next);
    });
  };
}

export { emailStore };
