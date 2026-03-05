/**
 * @module server/lib/reportCache
 * @description In-memory TTL cache for expensive report queries.
 *
 * Design goals:
 * - Zero external dependencies (no Redis, no file I/O)
 * - Per-tenant isolation via key namespacing
 * - Automatic expiry via TTL — no background sweep needed
 * - Invalidation by prefix for when data changes
 *
 * TTL guidelines:
 * - Portfolio / health summary: 60s
 * - Workload reports:           30s
 * - Client analytics:           60s
 * - Employee analytics:         60s
 * - Forecasting:               120s
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

let hitCount = 0;
let missCount = 0;

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

// Evict every 5 minutes to keep memory tidy
if (typeof setInterval !== "undefined") {
  setInterval(evictExpired, 5 * 60_000).unref?.();
}

export function get<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry || entry.expiresAt <= Date.now()) {
    store.delete(key);
    missCount++;
    return null;
  }
  hitCount++;
  return entry.value;
}

export function set<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function invalidateKey(key: string): void {
  store.delete(key);
}

/**
 * Returns cached value if fresh, otherwise calls `fetcher`, caches the result, and returns it.
 * The cache key should uniquely identify the query including tenant, filters, and date range.
 */
export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = get<T>(key);
  if (cached !== null) return cached;

  const value = await fetcher();
  set(key, value, ttlMs);
  return value;
}

export function getStats() {
  return {
    size: store.size,
    hits: hitCount,
    misses: missCount,
    hitRate: hitCount + missCount > 0
      ? Math.round((hitCount / (hitCount + missCount)) * 100)
      : 0,
  };
}

/**
 * Express middleware factory. Add to any GET route to transparently cache its
 * JSON response. Cache key is scoped per tenant + path + query string.
 *
 * Usage:
 *   router.get("/workload/team", withCache(30_000), async (req, res) => { ... })
 */
export function withCache(ttlMs: number) {
  return (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ): void => {
    if (req.method !== "GET") return next();

    const tenantId =
      (req as any).user?.tenantId ||
      (req as any).tenant?.effectiveTenantId ||
      (req as any).tenant?.tenantId ||
      "anon";
    const key = `rpt:${tenantId}:${req.path}:${JSON.stringify(req.query)}`;

    const cached = get<unknown>(key);
    if (cached !== null) {
      (res as any).setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    (res as any).setHeader("X-Cache", "MISS");

    const originalJson = res.json.bind(res);
    (res as any).json = function (body: unknown) {
      if (res.statusCode === 200) set(key, body, ttlMs);
      return originalJson(body);
    };

    next();
  };
}
