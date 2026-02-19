import { createLogger } from "../lib/logger";

const perfLog = createLogger("perf:query");
const PERF_TELEMETRY = process.env.PERF_TELEMETRY === "1";
const SLOW_QUERY_MS = Number(process.env.PERF_SLOW_QUERY_MS) || 500;

let slowQueryCount = 0;
let totalQueryCount = 0;

export function getQueryPerfStats() {
  return { slowQueryCount, totalQueryCount };
}

export function instrumentPool(pool: import("pg").Pool): void {
  if (!PERF_TELEMETRY) return;

  const origQuery = pool.query.bind(pool);

  (pool as any).query = function (...args: any[]) {
    totalQueryCount++;
    const start = performance.now();

    const result = origQuery(...args);

    if (result && typeof result.then === "function") {
      return result.then((res: any) => {
        const durationMs = Math.round((performance.now() - start) * 100) / 100;
        if (durationMs >= SLOW_QUERY_MS) {
          slowQueryCount++;
          const queryText = typeof args[0] === "string"
            ? args[0].slice(0, 120)
            : typeof args[0]?.text === "string"
              ? args[0].text.slice(0, 120)
              : "(prepared)";
          perfLog.warn("Slow query", { durationMs, query: queryText });
        }
        return res;
      });
    }
    return result;
  };
}
