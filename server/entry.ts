import { createServer, type IncomingMessage, type ServerResponse } from "http";

(globalThis as any).__ENTRY_BOOT = true;

const port = parseInt(process.env.PORT || "5000", 10);

let expressApp: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

const httpServer = createServer((req, res) => {
  if (expressApp) {
    expressApp(req, res);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>MyWorkDay</title></head><body>OK</body></html>");
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`[entry] Listening on 0.0.0.0:${port} — health checks ready`);

  import("./index").then(({ boot }) => {
    boot(httpServer, (handler: typeof expressApp) => {
      expressApp = handler;
      console.log("[entry] Express app attached — full application ready");
    });
  }).catch((err) => {
    console.error("[entry] Failed to load application:", err);
  });
});

process.on("SIGTERM", () => {
  console.log("[entry] SIGTERM received");
});

process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] Unhandled rejection:", reason);
});
