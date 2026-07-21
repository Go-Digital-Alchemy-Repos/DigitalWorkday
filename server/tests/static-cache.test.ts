import { describe, expect, it } from "vitest";
import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  getStaticCacheControl,
} from "../static";

describe("static asset cache control", () => {
  it("serves hashed build assets with immutable cache headers", () => {
    expect(getStaticCacheControl("/app/dist/public/assets/index-H-Z1mW3g.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("keeps the SPA document revalidatable after deploys", () => {
    expect(getStaticCacheControl("/app/dist/public/index.html")).toBe("no-cache");
  });

  it("uses a short cache for non-hashed static files", () => {
    expect(getStaticCacheControl("/app/dist/public/favicon.ico")).toBe("public, max-age=3600");
  });
});

describe("machine-readable crawler files", () => {
  it("keeps private application surfaces out of robots crawl scope", () => {
    const robots = buildRobotsTxt("https://digitalworkday.ai");

    expect(robots).toContain("Sitemap: https://digitalworkday.ai/sitemap.xml");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /portal/");
    expect(robots).toContain("Disallow: /super-admin/");
    expect(robots).toContain("Disallow: /projects");
  });

  it("limits sitemap entries to public, non-tenant URLs", () => {
    const sitemap = buildSitemapXml("https://digitalworkday.ai", new Date("2026-07-21T00:00:00.000Z"));

    expect(sitemap).toContain("<loc>https://digitalworkday.ai</loc>");
    expect(sitemap).toContain("<loc>https://digitalworkday.ai/login</loc>");
    expect(sitemap).toContain("<lastmod>2026-07-21</lastmod>");
    expect(sitemap).not.toContain("/portal");
    expect(sitemap).not.toContain("/projects");
  });

  it("publishes answer-engine guidance without private workspace sources", () => {
    const llms = buildLlmsTxt("https://digitalworkday.ai");

    expect(llms).toContain("# Digital Workday");
    expect(llms).toContain("Authenticated tenant, client portal, admin, report, chat, project, task, and API routes are not public documentation sources.");
  });
});
