import { AsyncLocalStorage } from "async_hooks";
import { config } from "../config";

const MAX_SAMPLES = 1000;
const MAX_ENDPOINTS = 500;

interface EndpointStats {
  latencies: number[];
  payloadSizes: number[];
  queryCounts: number[];
  requestCount: number;
}

interface ProfilingContext {
  queryCount: number;
}

export const profilingStore = new AsyncLocalStorage<ProfilingContext>();

export function incrementQueryCount(): void {
  const ctx = profilingStore.getStore();
  if (ctx) ctx.queryCount++;
}

export function getRequestQueryCount(): number {
  const ctx = profilingStore.getStore();
  return ctx ? ctx.queryCount : 0;
}

const endpoints = new Map<string, EndpointStats>();

function evictLeastUsed(): void {
  let minKey: string | null = null;
  let minCount = Infinity;
  for (const [key, stats] of endpoints) {
    if (stats.requestCount < minCount) {
      minCount = stats.requestCount;
      minKey = key;
    }
  }
  if (minKey) endpoints.delete(minKey);
}

function getOrCreate(endpoint: string): EndpointStats {
  let stats = endpoints.get(endpoint);
  if (!stats) {
    if (endpoints.size >= MAX_ENDPOINTS) {
      evictLeastUsed();
    }
    stats = { latencies: [], payloadSizes: [], queryCounts: [], requestCount: 0 };
    endpoints.set(endpoint, stats);
  }
  return stats;
}

function pushBounded(arr: number[], value: number): void {
  if (arr.length >= MAX_SAMPLES) {
    arr.shift();
  }
  arr.push(value);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computePercentiles(values: number[]): { p50: number; p95: number; p99: number } {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

export function recordRequest(
  endpoint: string,
  durationMs: number,
  payloadBytes: number,
  queryCount: number,
): void {
  if (!config.features.enablePerfProfiling) return;

  const stats = getOrCreate(endpoint);
  stats.requestCount++;
  pushBounded(stats.latencies, Math.round(durationMs * 100) / 100);
  pushBounded(stats.payloadSizes, payloadBytes);
  pushBounded(stats.queryCounts, queryCount);
}

export interface EndpointProfile {
  endpoint: string;
  requestCount: number;
  latency: { p50: number; p95: number; p99: number };
  payloadBytes: { min: number; max: number; avg: number };
  queryCount: { min: number; max: number; avg: number };
}

export function getProfilingData(): EndpointProfile[] | null {
  if (!config.features.enablePerfProfiling) return null;

  const result: EndpointProfile[] = [];

  for (const [endpoint, stats] of endpoints) {
    const latency = computePercentiles(stats.latencies);

    const payloadSorted = [...stats.payloadSizes].sort((a, b) => a - b);
    const querySorted = [...stats.queryCounts].sort((a, b) => a - b);

    const payloadSum = stats.payloadSizes.reduce((a, b) => a + b, 0);
    const querySum = stats.queryCounts.reduce((a, b) => a + b, 0);

    result.push({
      endpoint,
      requestCount: stats.requestCount,
      latency,
      payloadBytes: {
        min: payloadSorted.length > 0 ? payloadSorted[0] : 0,
        max: payloadSorted.length > 0 ? payloadSorted[payloadSorted.length - 1] : 0,
        avg: stats.payloadSizes.length > 0
          ? Math.round(payloadSum / stats.payloadSizes.length)
          : 0,
      },
      queryCount: {
        min: querySorted.length > 0 ? querySorted[0] : 0,
        max: querySorted.length > 0 ? querySorted[querySorted.length - 1] : 0,
        avg: stats.queryCounts.length > 0
          ? Math.round((querySum / stats.queryCounts.length) * 100) / 100
          : 0,
      },
    });
  }

  result.sort((a, b) => b.requestCount - a.requestCount);
  return result;
}

export function resetProfilingData(): void {
  endpoints.clear();
}
