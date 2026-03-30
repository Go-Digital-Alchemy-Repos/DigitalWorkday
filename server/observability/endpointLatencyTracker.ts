import { getBudgetForRoute, type EndpointBudget } from "./perfBudgets";

const MAX_SAMPLES = 1000;
const MAX_ENDPOINTS = 200;

interface EndpointSamples {
  latencies: number[];
  payloadSizes: number[];
  queryCounts: number[];
  totalRequests: number;
  lastAccessedAt: number;
}

const endpoints = new Map<string, EndpointSamples>();

function pushBounded(arr: number[], value: number): void {
  if (arr.length >= MAX_SAMPLES) {
    arr.shift();
  }
  arr.push(value);
}

function evictLeastRecentlyUsed(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, samples] of endpoints) {
    if (samples.lastAccessedAt < oldestTime) {
      oldestTime = samples.lastAccessedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) endpoints.delete(oldestKey);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export function recordEndpointMetrics(
  route: string,
  durationMs: number,
  payloadBytes: number,
  dbQueryCount: number,
): void {
  let samples = endpoints.get(route);
  if (!samples) {
    if (endpoints.size >= MAX_ENDPOINTS) {
      evictLeastRecentlyUsed();
    }
    samples = { latencies: [], payloadSizes: [], queryCounts: [], totalRequests: 0, lastAccessedAt: Date.now() };
    endpoints.set(route, samples);
  }
  samples.totalRequests++;
  samples.lastAccessedAt = Date.now();
  pushBounded(samples.latencies, Math.round(durationMs * 100) / 100);
  pushBounded(samples.payloadSizes, payloadBytes);
  pushBounded(samples.queryCounts, dbQueryCount);
}

export interface EndpointDistribution {
  route: string;
  totalRequests: number;
  latency: { p50: number; p95: number; p99: number };
  avgPayloadBytes: number;
  avgDbQueryCount: number;
  budget?: EndpointBudget;
}

export function getDistribution(): EndpointDistribution[] {
  const result: EndpointDistribution[] = [];

  for (const [route, samples] of endpoints) {
    const budget = getBudgetForRoute(route);
    if (!budget) continue;

    const sorted = [...samples.latencies].sort((a, b) => a - b);

    result.push({
      route,
      totalRequests: samples.totalRequests,
      latency: {
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
      },
      avgPayloadBytes: avg(samples.payloadSizes),
      avgDbQueryCount:
        samples.queryCounts.length > 0
          ? Math.round((samples.queryCounts.reduce((a, b) => a + b, 0) / samples.queryCounts.length) * 100) / 100
          : 0,
      budget,
    });
  }

  result.sort((a, b) => b.totalRequests - a.totalRequests);
  return result;
}

export function resetTracker(): void {
  endpoints.clear();
}
