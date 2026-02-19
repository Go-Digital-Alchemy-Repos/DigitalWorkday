const CLIENT_PERF_LOG = import.meta.env.VITE_CLIENT_PERF_LOG === "1";
const PERF_TELEMETRY = import.meta.env.VITE_PERF_TELEMETRY === "1";
const SAMPLE_RATE = 0.1;

interface PerfEntry {
  type: "navigation" | "chunk";
  view: string;
  durationMs: number;
  timestamp: number;
}

let buffer: PerfEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function shouldSample(): boolean {
  return Math.random() < SAMPLE_RATE;
}

function log(entry: PerfEntry): void {
  if (CLIENT_PERF_LOG) {
    const label = entry.type === "navigation" ? "nav" : "chunk";
    console.log(
      `[perf:${label}] ${entry.view} ${entry.durationMs.toFixed(1)}ms`
    );
  }

  if (PERF_TELEMETRY && shouldSample()) {
    buffer.push(entry);
    scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 5000);
}

async function flush(): Promise<void> {
  flushTimer = null;
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, 50);
  try {
    await fetch("/api/v1/system/perf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: batch }),
      keepalive: true,
    });
  } catch {
    // silently drop — telemetry is best-effort
  }
}

const activeTimers = new Map<string, number>();

export function markNavigationStart(view: string): void {
  if (!CLIENT_PERF_LOG && !PERF_TELEMETRY) return;
  activeTimers.set(`nav:${view}`, performance.now());
}

export function markNavigationEnd(view: string): void {
  if (!CLIENT_PERF_LOG && !PERF_TELEMETRY) return;
  const key = `nav:${view}`;
  const start = activeTimers.get(key);
  if (start == null) return;
  activeTimers.delete(key);

  log({
    type: "navigation",
    view,
    durationMs: Math.round((performance.now() - start) * 10) / 10,
    timestamp: Date.now(),
  });
}

export function trackChunkLoad<T>(
  view: string,
  importFn: () => Promise<T>
): () => Promise<T> {
  if (!CLIENT_PERF_LOG && !PERF_TELEMETRY) return importFn;

  return () => {
    const start = performance.now();
    return importFn().then((mod) => {
      const durationMs =
        Math.round((performance.now() - start) * 10) / 10;
      log({ type: "chunk", view, durationMs, timestamp: Date.now() });
      return mod;
    });
  };
}

export function usePerfTiming(view: string): void {
  if (!CLIENT_PERF_LOG && !PERF_TELEMETRY) return;
  markNavigationStart(view);
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      markNavigationEnd(view);
    });
  });
}
