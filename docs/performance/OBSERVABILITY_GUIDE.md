# Observability & Performance Budget Guide

This document explains the observability infrastructure, environment flags, performance budgets, and how to interpret the data exposed by the system.

## Environment Flags

| Flag | Default | Description |
|------|---------|-------------|
| `ENABLE_OBSERVABILITY` | `true` | Gates the `/api/v1/system/observability` endpoint. When disabled, the endpoint returns 404. |
| `ENABLE_PERF_PROFILING` | `true` in staging | Enables per-endpoint profiling data (latency percentiles, payload/query stats) via `perfProfiler`. |
| `ENABLE_DB_POOL_METRICS` | varies | Exposes PostgreSQL connection pool statistics on the observability endpoint. |
| `ENABLE_PAYLOAD_GUARDS` | varies | Activates response payload size monitoring middleware on `/api` routes. |
| `ENABLE_LOG_SAMPLING` | varies | Controls whether structured log sampling is active. |
| `PERF_TELEMETRY` | `0` | Set to `1` to enable the dedicated perf telemetry middleware (slow-request logging). |
| `PERF_BUDGET_MULTIPLIER` | `1` | Multiplies all budget thresholds (e.g., set to `2` in slow CI environments). |
| `PERF_SLOW_THRESHOLD_MS` | `800` | Duration threshold for flagging a request as slow. |
| `PERF_SLOW_QUERY_MS` | `500` | Duration threshold for flagging a DB query as slow. |
| `PAYLOAD_WARN_BYTES` | `500000` | Payload size that triggers a warning in the payload guard. |
| `PAYLOAD_ERROR_BYTES` | `2000000` | Payload size that triggers an error log in the payload guard. |

## Performance Budget System

Performance budgets are defined in `server/observability/perfBudgets.ts`. Each budgeted endpoint specifies:

- **p95Ms** — The target p95 latency in milliseconds.
- **maxPayloadBytes** — Maximum expected response payload size in bytes.
- **maxDbQueries** — Maximum expected number of database queries per request.

When any dimension is exceeded during a request, a unified `[perf:budget] Budget exceeded` warning is emitted with all violations listed.

### Currently Budgeted Endpoints

| Endpoint | p95 Target | Max Payload | Max Queries |
|----------|-----------|-------------|-------------|
| `/api/tasks/my` | 800ms | 500KB | 12 |
| `/api/tasks` | 600ms | 300KB | 10 |
| `/api/clients` | 700ms | 300KB | 6 |
| `/api/clients/:id` | 400ms | 50KB | 4 |
| `/api/projects` | 600ms | 300KB | 8 |
| `/api/projects/:id` | 400ms | 50KB | 6 |
| `/api/time-entries` | 800ms | 500KB | 10 |
| `/api/timer` | 400ms | 100KB | 6 |
| `/api/v1/notifications/unread-count` | 200ms | 1KB | 2 |
| `/api/v1/notifications` | 400ms | 200KB | 6 |
| `/api/v1/reports/workload` | 2000ms | 1MB | 15 |
| `/api/v1/reports/tasks/analytics` | 1500ms | 500KB | 12 |
| `/api/v1/reports/clients/analytics` | 1500ms | 500KB | 12 |
| `/api/reports/v2/client` | 2000ms | 1MB | 15 |
| `/api/reports/v2/employee` | 2000ms | 1MB | 15 |

### Tuning Budgets

- Adjust individual thresholds directly in `perfBudgets.ts`.
- Use `PERF_BUDGET_MULTIPLIER` to scale all thresholds uniformly (useful for CI or slower environments).
- Budget matching uses exact path first, then prefix-based fallback, so `/api/clients/:id` will match `/api/clients/abc123`.

## The Observability Endpoint

**GET** `/api/v1/system/observability`

Returns a JSON object with the following sections:

### `latencyDistribution`

An array of per-endpoint distribution objects, sorted by request count (descending). Each entry contains:

```json
{
  "route": "/api/tasks/my",
  "totalRequests": 245,
  "latency": {
    "p50": 120.5,
    "p95": 450.2,
    "p99": 780.0
  },
  "avgPayloadBytes": 35200,
  "avgDbQueryCount": 4.5,
  "budget": {
    "p95Ms": 800,
    "maxPayloadBytes": 500000,
    "maxDbQueries": 12
  }
}
```

- **latency.p50/p95/p99** — Running percentile latencies computed from the most recent ~1000 samples per endpoint.
- **avgPayloadBytes** — Average response payload size.
- **avgDbQueryCount** — Average number of database queries per request.
- **budget** — The configured budget for this endpoint (included only if a budget is defined).

### Other Sections

- **`pool`** — PostgreSQL connection pool stats (active, idle, waiting connections).
- **`requests`** — Aggregate slow/total request counts from perf telemetry.
- **`queries`** — Aggregate slow/total query counts from query telemetry.
- **`unified`** — Combined perf stats from the unified perf logger.
- **`budgets`** — The full budget configuration map.
- **`profiling`** — Per-endpoint profiling data (when `ENABLE_PERF_PROFILING` is active).
- **`flags`** — Current state of all observability feature flags.

## Interpreting p95/p99 Numbers

- **p50 (median)** — Half of requests complete faster than this. Represents the typical user experience.
- **p95** — 95% of requests complete within this time. This is the primary target for budgets. A high p95 means 1 in 20 users sees poor performance.
- **p99** — 99% of requests complete within this time. Captures tail latency. A very high p99 relative to p95 indicates occasional outliers (e.g., cold DB connections, GC pauses).

### Warning Signs

| Signal | What it means |
|--------|--------------|
| p95 exceeds budget | Consistent slowness, likely a query or logic issue. |
| p99 >> p95 (more than 3x) | Tail latency spikes — investigate connection pool exhaustion, lock contention, or cold caches. |
| avgDbQueryCount climbing | Possible N+1 regression — review recent query pattern changes. |
| avgPayloadBytes growing | Response bloat — check if unnecessary fields are being returned. |

## Structured Log Format

Each request log line includes unified metrics:

```
[request] Request completed { requestId, method, path, status, durationMs, payloadBytes, dbQueryCount, dbDurationMs }
```

Budget violations are logged separately:

```
[perf:budget] Budget exceeded { route, violations: ["latency 950ms > 800ms", "queries 14 > 12"], durationMs, payloadBytes, dbQueryCount }
```

## Data Retention

- The latency tracker keeps up to **1000 samples per endpoint** in a ring buffer (FIFO eviction).
- Data is **in-memory only** — it resets on server restart.
- No data is persisted to disk or sent to external services.
- The tracker runs on all API routes regardless of feature flags to ensure baseline visibility.
- Payload bytes are captured from the `content-length` response header. For chunked or compressed responses where `content-length` is absent, payload size will be reported as 0. This means payload budget violations may be under-reported for some endpoints.
