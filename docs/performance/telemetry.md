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

Returns:

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
