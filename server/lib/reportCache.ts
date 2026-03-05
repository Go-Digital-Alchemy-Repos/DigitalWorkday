import crypto from "crypto";

interface CacheEntry<T = unknown> {
  data: T;
  createdAt: number;
  ttl: number;
}

const DEFAULT_TTL_MS = 120_000;
const MAX_ENTRIES = 200;

const cache = new Map<string, CacheEntry>();

function evictExpired(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  cache.forEach((entry, key) => {
    if (now - entry.createdAt >= entry.ttl) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((k) => cache.delete(k));
}

function evictLRU(): void {
  if (cache.size <= MAX_ENTRIES) return;
  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
}

function hashParams(params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash("md5").update(sorted).digest("hex").slice(0, 12);
}

export function buildCacheKey(
  tenantId: string,
  reportName: string,
  params: Record<string, unknown> = {}
): string {
  const h = hashParams(params);
  return `${tenantId}:${reportName}:${h}`;
}

export function getCached<T = unknown>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt >= entry.ttl) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.data as T;
}

export function setCache<T = unknown>(
  key: string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  evictExpired();
  cache.set(key, { data, createdAt: Date.now(), ttl: ttlMs });
  evictLRU();
}

export function shouldBypassCache(query: Record<string, unknown>): boolean {
  return query.fresh === "true" || query.fresh === "1";
}

export function setCacheHeaders(
  res: { setHeader(name: string, value: string): void },
  cached: boolean,
  ttlSeconds: number = 60
): void {
  res.setHeader("Cache-Control", `max-age=${ttlSeconds}`);
  res.setHeader("X-Report-Cache", cached ? "HIT" : "MISS");
}

export function invalidateTenantReports(tenantId: string): void {
  const prefix = `${tenantId}:`;
  const keysToDelete: string[] = [];
  cache.forEach((_entry, key) => {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((k) => cache.delete(k));
}

export function clearReportCache(): void {
  cache.clear();
}

export function reportCacheStats(): { size: number; maxEntries: number } {
  evictExpired();
  return { size: cache.size, maxEntries: MAX_ENTRIES };
}
