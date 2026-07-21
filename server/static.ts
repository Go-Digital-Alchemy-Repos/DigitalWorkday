import express, { type Express } from "express";
import type { Response } from "express";
import fs from "fs";
import path from "path";

const ONE_YEAR_SECONDS = 31536000;

export function getStaticCacheControl(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (normalizedPath.includes("/assets/")) {
    return `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
  }
  if (normalizedPath.endsWith(".html")) {
    return "no-cache";
  }
  return "public, max-age=3600";
}

function setStaticCacheHeaders(res: Response, filePath: string): void {
  res.setHeader("Cache-Control", getStaticCacheControl(filePath));
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders: setStaticCacheHeaders,
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
