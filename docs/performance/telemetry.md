# Telemetry & Slow-Query Sampling

## Overview

MyWorkDay includes a layered telemetry system for tracking request latency and slow database queries across both server and client.

## Architecture

### Server-Side

#### 1. Legacy Middleware (`PERF_TELEMETRY=1`)

Opt-in telemetry activated by setting `PERF_TELEMETRY=1`:

- **`server/middleware/perfTelemetry.ts`** — Logs requests slower than `PERF_SLOW_THRESHOLD_MS` (default 800ms).
- **`server/middleware/queryTelemetry.ts`** — Instruments the pg Pool; logs queries slower than `PERF_SLOW_QUERY_MS` (default 500ms).

#### 2. Unified PerfLogger (`server/lib/perfLogger.ts`)

Always-on facade that provides:

| Feature | Detail |
|---------|--------|
| **Request sampling** | 5% in production (`PERF_SAMPLE_RATE`), 100% in dev |
| **Slow request logging** | Requests ≥ 300ms (configurable via `PERF_SLOW_THRESHOLD_MS`) |
| **Slow query logging** | Queries ≥ 300ms (configurable via `PERF_SLOW_QUERY_MS`) |
| **Stats endpoint** | `GET /api/v1/system/perf/stats` returns unified counters |

Environment variables:

| Variable | Default (prod) | Default (dev) | Description |
|----------|---------------|---------------|-------------|
| `PERF_SAMPLE_RATE` | `0.05` (5%) | `1` (100%) | Fraction of requests to log |
| `PERF_SLOW_THRESHOLD_MS` | `300` | `300` | Request duration threshold |
| `PERF_SLOW_QUERY_MS` | `300` | `300` | Query duration threshold |

#### 3. Staging Performance Profiling (`server/observability/perfProfiler.ts`)

Endpoint-level profiling that is **enabled by default in staging** (`NODE_ENV=staging`) and opt-in elsewhere via `ENABLE_PERF_PROFILING=true`. In production, profiling is off by default to avoid overhead.

When enabled, the profiling system continuously collects per-endpoint:

| Metric | Detail |
|--------|--------|
| **Latency percentiles** | p50, p95, p99 computed from a rolling window of up to 1000 samples per endpoint |
| **Response payload sizes** | min, max, avg in bytes |
| **Query counts per request** | min, max, avg queries executed per request |

The profiling middleware (`server/middleware/profilingMiddleware.ts`) runs after the unified perf logger and only instruments `/api` routes. It does not conflict with existing `perfLoggerMiddleware` or `requestPerfMiddleware`.

**Enabling/Disabling:**

| Environment | Default | Override |
|-------------|---------|----------|
| `NODE_ENV=staging` | Enabled | Set `ENABLE_PERF_PROFILING=false` to disable |
| `NODE_ENV=production` | Disabled | Set `ENABLE_PERF_PROFILING=true` to enable |
| `NODE_ENV=development` | Disabled | Set `ENABLE_PERF_PROFILING=true` to enable |

**What stays gated behind `QUERY_DEBUG` / `API_PERF_LOG`:**

Deep debug output (full query text, verbose per-request console logs) is not exposed by staging profiling. Those remain opt-in via `QUERY_DEBUG=true` or `API_PERF_LOG=1`.

### Client-Side (`client/src/lib/perf.ts`)

Frontend route telemetry with:

- **`performance.mark()`** — Standard Performance API marks (`mwd:nav:<view>:start/end`) visible in DevTools Performance tab.
- **`performance.measure()`** — Creates named measures for each route navigation.
- **5% sample rate** — Client metrics are sampled before sending to server.
- **Buffer flush** — Batches up to 50 entries and flushes every 5 seconds to `POST /api/v1/system/perf`.
- **Chunk load tracking** — `trackChunkLoad()` wraps lazy imports to measure code-split load times.

Activation:

| Variable | Purpose |
|----------|---------|
| `VITE_CLIENT_PERF_LOG=1` | Console.log client perf timings |
| `VITE_PERF_TELEMETRY=1` | Send sampled metrics to server |

### Route Timing Integration

The `TenantRouteGuard` in `client/src/routing/guards.ts` automatically calls `markNavigationStart()` / `markNavigationEnd()` for every guarded route transition. This means all tenant pages are automatically instrumented.

## Stats Endpoint

```
GET /api/v1/system/perf/stats
```

Returns (when profiling is disabled):

```json
{
  "enabled": true,
  "requests": { "slowRequestCount": 2, "totalRequestCount": 150 },
  "queries": { "slowQueryCount": 1, "totalQueryCount": 500 },
  "unified": {
    "requests": {
      "total": 150,
      "sampled": 8,
      "slow": 2,
      "sampleRate": 0.05,
      "slowThresholdMs": 300
    },
    "queries": {
      "total": 500,
      "slow": 1,
      "slowThresholdMs": 300
    }
  }
}
```

When profiling is enabled, the response includes an additional `profiling` array:

```json
{
  "enabled": true,
  "requests": { "..." : "..." },
  "queries": { "..." : "..." },
  "unified": { "..." : "..." },
  "profiling": [
    {
      "endpoint": "GET /api/tasks/my",
      "requestCount": 245,
      "latency": { "p50": 120.5, "p95": 380.2, "p99": 520.1 },
      "payloadBytes": { "min": 1200, "max": 450000, "avg": 85000 },
      "queryCount": { "min": 3, "max": 12, "avg": 6.5 }
    }
  ]
}
```

The `profiling` array is sorted by request count (most-requested endpoints first). Each entry shows the rolling-window percentiles, payload size stats, and query count distribution for that endpoint.

The same `profiling` field is also included in the `GET /api/v1/system/observability` response when profiling is enabled.

## Reading Profiling Data

- **p50** — Median latency. Half of requests are faster than this.
- **p95** — 95th percentile. Only 5% of requests are slower.
- **p99** — 99th percentile. Tail latency — useful for spotting outliers.
- **payloadBytes.avg** — Average response size. Compare against perf budgets in `server/observability/perfBudgets.ts`. Note: payload sizes are measured for `res.json()` and `res.send()` responses only; streamed or `res.end()` responses will report 0 bytes.
- **queryCount.avg** — Average DB queries per request. High values may indicate N+1 query patterns.

## Log Format

Server perf logs use structured JSON via `createLogger`:

```json
{
  "timestamp": "2026-02-21T...",
  "level": "warn",
  "source": "perf",
  "message": "Slow request",
  "requestId": "abc123",
  "tenantHash": "a1b2c3d4",
  "method": "GET",
  "route": "/api/v1/clients/hierarchy/list",
  "durationMs": 450,
  "slow": true,
  "sampled": true
}
```

## Design Decisions

1. **Unified logger is always-on** — No env var required. Sampling controls volume in production.
2. **Legacy middleware preserved** — Existing `PERF_TELEMETRY=1` middleware remains for backward compatibility. Both can run simultaneously without conflict.
3. **Tenant ID hashing** — Tenant IDs are SHA-256 hashed (8-char prefix) in logs to prevent PII leakage while allowing correlation.
4. **Client marks use `mwd:` prefix** — Prevents collision with browser/library marks in the Performance API timeline.
5. **Staging profiling is default-on** — `enablePerfProfiling` defaults to `true` when `NODE_ENV=staging`, removing the need for manual opt-in. In production it remains off by default.
6. **Rolling window bounds memory** — Each endpoint retains at most 1000 latency/payload/query samples, preventing unbounded memory growth during long-running staging sessions.
7. **Profiling middleware is additive** — It does not replace or interfere with existing `perfLoggerMiddleware` or `requestPerfMiddleware`. All three can coexist.
