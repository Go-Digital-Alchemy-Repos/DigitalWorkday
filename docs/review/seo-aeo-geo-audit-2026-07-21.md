# Technical SEO, AEO, GEO, and Machine-Readable Content Audit - 2026-07-21

## Executive Assessment

Overall score: 7.5/10.

Release recommendation: Approve with follow-up. Digital Workday is primarily an authenticated SaaS application, so the correct launch posture is controlled public discoverability for the product entity while keeping tenant, portal, API, project, chat, report, and admin content out of crawler scope.

Strongest aspects:
- The app is a single-page React/Vite application with a stable HTML shell in `client/index.html` and production static serving through `server/static.ts`.
- Auth routing in `client/src/App.tsx` and `client/src/routing/*` keeps workspace, client portal, super-admin, project, report, and chat surfaces behind login.
- Public link generation already centralizes deployed host resolution through `server/lib/appLinks.ts`.

Most important risks:
- `robots.txt`, `sitemap.xml`, and `llms.txt` were absent, so crawlers could receive the SPA fallback instead of explicit crawl policy.
- The HTML shell had only basic title and description metadata and did not name the broader project operations/client portal entity consistently.
- There is no public content governance model yet for docs, pricing, case studies, source attribution, or answer-engine quotable pages. Adding broad schema before those pages exist would be unsupported.

## System Map

Relevant execution flow:
- `client/index.html` provides the shell metadata before React renders.
- `client/src/App.tsx` redirects unauthenticated users to `/login` except public auth routes.
- `server/index.ts` mounts application/API routes, error handlers, then production static serving.
- `server/static.ts` serves built assets, SPA fallback, and now machine-readable crawler files.
- `server/lib/appLinks.ts` resolves `APP_PUBLIC_URL`/`APP_URL` or trusted request hosts for canonical deployed URLs.

Areas inspected: HTML metadata, production static serving, route map, auth route boundaries, app link canonical host helper, existing docs mentioning production/staging domains, and current build/static asset behavior.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEO-001 | Medium | Confirmed | Cross-cutting | `server/static.ts` | No `robots.txt`, `sitemap.xml`, or `llms.txt` route existed before the SPA fallback. | Crawlers and answer engines lacked an explicit boundary between public product pages and authenticated tenant content. | Added dynamic crawler endpoints using the canonical app base URL. | S | Low | `npx vitest run server/tests/static-cache.test.ts` |
| SEO-002 | Medium | Confirmed | Local | `client/index.html` | Title and description only described "Project Management"; no Open Graph, Twitter, application name, sitemap link, or JSON-LD existed. | Public previews and machine readers had incomplete entity context. | Added richer metadata and conservative `SoftwareApplication` JSON-LD. | XS | Low | `npm run test:ci` build |
| SEO-003 | Low | Strongly Supported | Systemic | `client/src/routing/tenantRouter.tsx`, `portalRouter.tsx`, `superRouter.tsx` | Authenticated surfaces include `/projects`, `/clients`, `/reports`, `/chat`, `/portal`, and `/super-admin`. | Indexing these paths would risk exposing private route shapes and low-value login redirects. | Robots disallows authenticated work surfaces and sitemap excludes them. | XS | Low | Static crawler-file tests |
| SEO-004 | Informational | Confirmed | Content governance | Repository docs | Product docs exist internally, but no public marketing/docs pages are routed for crawler consumption. | AEO/GEO gains require accurate public content, not fabricated schema. | Add public docs/landing content only when business wants indexed acquisition content. | M | Moderate | Future content QA |

## Changes Made

- Updated `server/static.ts` with:
  - `GET /robots.txt`
  - `GET /sitemap.xml`
  - `GET /llms.txt`
  - reusable builders for regression tests
- Updated `client/index.html` with richer description, robots meta, Open Graph/Twitter preview tags, sitemap link, and conservative `SoftwareApplication` JSON-LD.
- Expanded `server/tests/static-cache.test.ts` to cover robots, sitemap, and answer-engine guidance.
- Added this review report.

Compatibility considerations: authenticated product routes remain unchanged. The sitemap intentionally lists only public entry points and does not expose tenant or client portal URLs.

## Verification Results

Commands executed:
- `npx vitest run server/tests/static-cache.test.ts`
- `npm run production:check`
- `npm run test:ci`

Expected remaining gaps:
- Live verification after deploy should run `curl -I` and `curl` checks for `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/login`, and `/assets/<bundle>.js`.
- Public AEO/GEO content depth remains limited because the app does not yet have public docs/landing pages.

## Residual Risk And Roadmap

Immediate:
- Ensure production and staging set `APP_PUBLIC_URL` correctly so generated sitemap URLs are canonical.
- After deploy, verify `robots.txt` disallows authenticated surfaces and `sitemap.xml` contains only public routes.

Near term:
- Decide whether Digital Workday should have public marketing/docs pages. If yes, build real public pages with accurate headings, source-owned claims, FAQs, and organization/contact content.
- Add a Playwright smoke check for HTML head metadata and crawler endpoints.

Long term:
- Add structured data only for real public entities and pages: `Organization`, `SoftwareApplication`, `FAQPage`, or `Article` only where the visible page supports it.
- Add content governance for freshness, review owners, published dates, and source attribution.

Not justified yet:
- Review/rating schema, fake FAQ schema, autogenerated location pages, mass programmatic SEO pages, or making private client portal data crawlable.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Crawlability | 8 | Crawler files now exist; public content surface is intentionally small. |
| Indexability control | 8 | Authenticated surfaces are disallowed, but live verification is pending deploy. |
| Metadata | 8 | Shell metadata improved; per-route SSR metadata is not present. |
| Structured data | 7 | Conservative app schema added; no unsupported schemas. |
| AEO/GEO readiness | 6 | `llms.txt` exists; deeper public answer content is not built. |
| Entity consistency | 8 | Product positioning is now consistent across shell and crawler guidance. |
| Content governance | 6 | Internal docs are strong, but public content ownership/freshness workflow is future work. |
