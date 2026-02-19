/**
 * Lightweight query count instrumentation for N+1 detection.
 * Enable with QUERY_DEBUG=true or API_PERF_LOG=1 environment variable.
 * 
 * Usage:
 *   const tracker = createQueryTracker("endpoint-name");
 *   tracker.track("query-description");
 *   // ... run queries ...
 *   tracker.log(); // outputs summary if enabled
 */

function isPerfEnabled(): boolean {
  return process.env.QUERY_DEBUG === "true" || process.env.API_PERF_LOG === "1";
}

interface QueryTracker {
  track: (label: string) => void;
  log: () => { label: string; count: number; queries: string[]; elapsedMs: number };
  getCount: () => number;
}

export function createQueryTracker(label: string): QueryTracker {
  const isEnabled = isPerfEnabled();
  const queries: string[] = [];
  const startTime = Date.now();

  return {
    track(queryLabel: string) {
      if (isEnabled) {
        queries.push(queryLabel);
      }
    },
    log() {
      const elapsed = Date.now() - startTime;
      const result = { label, count: queries.length, queries, elapsedMs: elapsed };
      
      if (isEnabled && queries.length > 0) {
        console.log(`[API_PERF] ${label}: ${queries.length} queries in ${elapsed}ms`);
        if (queries.length > 5) {
          const grouped: Record<string, number> = {};
          for (const q of queries) {
            grouped[q] = (grouped[q] || 0) + 1;
          }
          console.log(`[API_PERF] Query breakdown:`, grouped);
        }
      }
      
      return result;
    },
    getCount() {
      return queries.length;
    }
  };
}

export function perfLog(endpoint: string, message: string): void {
  if (isPerfEnabled()) {
    console.log(`[API_PERF] ${endpoint}: ${message}`);
  }
}

export function isQueryDebugEnabled(): boolean {
  return isPerfEnabled();
}
