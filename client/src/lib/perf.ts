const CLIENT_PERF_LOG = import.meta.env.VITE_CLIENT_PERF_LOG === "1";
const PERF_TELEMETRY = import.meta.env.VITE_PERF_TELEMETRY === "1";
const SAMPLE_RATE = 0.05;

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
  try {
    performance.mark(`mwd:nav:${view}:start`);
  } catch {}
}

export function markNavigationEnd(view: string): void {
  if (!CLIENT_PERF_LOG && !PERF_TELEMETRY) return;
  const key = `nav:${view}`;
  const start = activeTimers.get(key);
  if (start == null) return;
  activeTimers.delete(key);

  const durationMs = Math.round((performance.now() - start) * 10) / 10;

  try {
    performance.mark(`mwd:nav:${view}:end`);
    performance.measure(`mwd:nav:${view}`, `mwd:nav:${view}:start`, `mwd:nav:${view}:end`);
  } catch {}

  log({
    type: "navigation",
    view,
    durationMs,
    timestamp: Date.now(),
  });
}

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("is not a valid JavaScript MIME type") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    error.name === "ChunkLoadError"
  );
}

const CHUNK_RELOAD_KEY = "__chunk_reload_ts";

function handleChunkLoadError(error: unknown): never {
  if (isChunkLoadError(error)) {
    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const now = Date.now();
    if (!lastReload || now - Number(lastReload) > 10_000) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
      window.location.reload();
    }
  }
  throw error;
}

export { isChunkLoadError };

export function trackChunkLoad<T>(
  view: string,
  importFn: () => Promise<T>
): () => Promise<T> {
  const wrappedImport = () => importFn().catch(handleChunkLoadError);

  if (!CLIENT_PERF_LOG && !PERF_TELEMETRY) return wrappedImport;

  return () => {
    const start = performance.now();
    return wrappedImport().then((mod) => {
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
