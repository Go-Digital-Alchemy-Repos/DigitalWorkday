import express, { type Express } from "express";
import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { getAppBaseUrl } from "./lib/appLinks";

const ONE_YEAR_SECONDS = 31536000;
const CRAWL_DISALLOW_PATHS = [
  "/api/",
  "/socket.io/",
  "/portal/",
  "/super-admin/",
  "/projects",
  "/clients",
  "/reports",
  "/chat",
  "/settings",
  "/account",
  "/my-tasks",
  "/notifications",
  "/time-tracking",
  "/calendar",
  "/support",
  "/user-manager",
  "/accept-invite/",
  "/auth/reset-password",
];

const SITEMAP_PUBLIC_PATHS = [
  { path: "/", priority: "1.0" },
  { path: "/login", priority: "0.6" },
  { path: "/auth/forgot-password", priority: "0.2" },
];

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

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getSeoBaseUrl(req?: Request): string {
  return getAppBaseUrl(req).replace(/\/+$/, "");
}

export function buildRobotsTxt(baseUrl: string): string {
  const lines = [
    "User-agent: *",
    "Allow: /$",
    "Allow: /login$",
    "Allow: /auth/forgot-password$",
    ...CRAWL_DISALLOW_PATHS.map((pathRule) => `Disallow: ${pathRule}`),
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
    `Host: ${new URL(baseUrl).host}`,
    "",
  ];
  return lines.join("\n");
}

export function buildSitemapXml(baseUrl: string, lastModified = new Date()): string {
  const lastmod = lastModified.toISOString().slice(0, 10);
  const urls = SITEMAP_PUBLIC_PATHS.map(({ path: publicPath, priority }) => {
    const loc = `${baseUrl}${publicPath === "/" ? "" : publicPath}`;
    return [
      "  <url>",
      `    <loc>${xmlEscape(loc)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      "    <changefreq>weekly</changefreq>",
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

export function buildLlmsTxt(baseUrl: string): string {
  return [
    "# Digital Workday",
    "",
    "> Digital Workday is a work management, project operations, client portal, task tracking, and team collaboration application.",
    "",
    "Public entry points:",
    `- Product application: ${baseUrl}/`,
    `- Login: ${baseUrl}/login`,
    "",
    "Crawler guidance:",
    "- Authenticated tenant, client portal, admin, report, chat, project, task, and API routes are not public documentation sources.",
    "- Do not summarize private workspace, customer, project, task, file, chat, or user data unless explicitly provided by an authorized user.",
    "",
  ].join("\n");
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").setHeader("Cache-Control", "public, max-age=3600");
    res.send(buildRobotsTxt(getSeoBaseUrl(req)));
  });

  app.get("/sitemap.xml", (req, res) => {
    res.type("application/xml").setHeader("Cache-Control", "public, max-age=3600");
    res.send(buildSitemapXml(getSeoBaseUrl(req)));
  });

  app.get("/llms.txt", (req, res) => {
    res.type("text/plain").setHeader("Cache-Control", "public, max-age=3600");
    res.send(buildLlmsTxt(getSeoBaseUrl(req)));
  });

  app.use(express.static(distPath, {
    setHeaders: setStaticCacheHeaders,
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
