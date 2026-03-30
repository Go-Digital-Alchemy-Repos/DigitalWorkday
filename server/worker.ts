import "dotenv/config";
import { config } from "./config";
import { processMode, shouldRunWorkers } from "./lib/processMode";
import http from "http";
import { ensureSchemaReady } from "./startup/schemaReadiness";
import { startAllSchedulers, stopAllSchedulers } from "./workers/schedulerBootstrap";
import { registerAllHandlers, startJobQueue, stopJobQueue } from "./jobs";

if (!shouldRunWorkers()) {
  console.error(`[worker] FATAL: PROCESS_MODE="${processMode}" does not include worker concerns.`);
  console.error("[worker] Use PROCESS_MODE=all or PROCESS_MODE=worker for this entry point.");
  process.exit(1);
}

const port = parseInt(process.env.WORKER_PORT || "5001", 10);
const host = "0.0.0.0";

let isReady = false;

const healthServer = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(isReady ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: isReady ? "healthy" : "starting",
      mode: "worker",
      uptime: process.uptime(),
    }));
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
});

healthServer.listen(port, host, () => {
  console.log(`[worker] Health endpoint listening on ${host}:${port}`);
});

(async () => {
  try {
    console.log("[worker] Ensuring schema is ready...");
    await ensureSchemaReady();
    console.log("[worker] Schema ready");

    registerAllHandlers();
    startJobQueue();
    startAllSchedulers();

    isReady = true;
    console.log("[worker] Worker process is ready");
  } catch (err) {
    console.error("[worker] Fatal startup error:", err);
    process.exit(1);
  }
})();

const SHUTDOWN_TIMEOUT_MS = 10_000;
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[worker-shutdown] ${signal} received — starting graceful shutdown...`);

  const forceTimer = setTimeout(() => {
    console.error("[worker-shutdown] Timed out after 10s — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    console.log("[worker-shutdown] 1/3  Stopping job queue...");
    await stopJobQueue();
    console.log("[worker-shutdown] 1/3  Job queue stopped");

    console.log("[worker-shutdown] 2/3  Stopping schedulers...");
    stopAllSchedulers();
    console.log("[worker-shutdown] 2/3  Schedulers stopped");

    console.log("[worker-shutdown] 3/3  Closing health server...");
    await new Promise<void>((resolve, reject) => {
      healthServer.close((err) => (err ? reject(err) : resolve()));
    });
    console.log("[worker-shutdown] 3/3  Health server closed");

    try {
      const { pool } = await import("./db");
      await pool.end();
      console.log("[worker-shutdown] Database pool drained");
    } catch {
      console.log("[worker-shutdown] Database pool was not initialised — skipped");
    }

    console.log("[worker-shutdown] Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[worker-shutdown] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
