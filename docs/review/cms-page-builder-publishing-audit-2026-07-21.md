# CMS, Page Builder, and Publishing Architecture Review

Date: 2026-07-21
Branch: `main`

## Executive Assessment

Overall score: 7/10
Release recommendation: Approve with follow-up

Digital Workday does not currently ship a public CMS, page builder, or public publishing workflow. That is appropriate for the current product shape: authenticated SaaS, tenant operations, client portal, documents, notes, chat, projects, tasks, and super-admin operations. The strongest current posture is that public crawl surfaces are narrow, internal docs are super-admin gated, and file downloads are routed through authenticated tenant/client checks and presigned URLs.

The main risk was governance drift: there was no explicit product/engineering boundary preventing future content-adjacent work from accidentally becoming public publishing. I added a documented boundary and an executable publishing readiness gate.

Strongest aspects:

- Public crawler metadata is explicit in `server/static.ts` and excludes tenant/client routes.
- Super-admin repository documentation routes in `server/routes/modules/super-admin/docs.router.ts` require `requireSuperUser` and contain doc paths under `DOCS_DIR`.
- Tenant default documents and client documents use authenticated tenant routing with tenant/client checks before presigned downloads.

Most important risks:

- There is no real CMS/page-builder model yet, so public publishing should not be marketed as available.
- Future public page work would need dedicated lifecycle, permission, preview, publish, rollback, media, cache, and sitemap models.
- Existing rich-text operational content should stay separate from public content until server-side sanitization and publishing controls exist.

## System Map

Application type: authenticated multi-tenant SaaS application.
Runtime and frameworks: Node.js 20, Express 4, React 18, Vite 7, TypeScript 5.6, Drizzle ORM, PostgreSQL, npm 11.
Deployment model: Railway-facing Node app with build output under `dist`, production smoke checks, Docker/runtime definitions, health routes, and CI scripts.
Authentication model: Express session/passport with role and tenant middleware.
Content-adjacent areas inspected: public static/crawler routes, super-admin docs, tenant default docs, client documents, rich-text utilities, upload services, schema content fields, and package verification scripts.

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Remediation | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CMS-001 | Medium | Confirmed | `docs/12-OPERATIONS/PUBLIC_CONTENT_GOVERNANCE.md` missing before this change | No repository policy described what may become public content or what a future CMS requires. | Future content work could accidentally expose tenant resources or crawler-index private paths. | Added governance doc and static `npm run publishing:check` gate. | S | Low |
| CMS-002 | Informational | Confirmed | `server/static.ts` | Sitemap includes `/`, `/login`, `/auth/forgot-password`; robots disallows `/api/`, `/portal/`, `/super-admin/`, projects, clients, reports, chat, and settings. | Current public publishing surface is intentionally narrow. | Preserve this until a dedicated published-content model exists. | XS | Low |
| CMS-003 | Informational | Confirmed | `server/routes/modules/super-admin/docs.router.ts` | `/docs`, `/docs/:docPath`, `/docs/sync`, and `/docs/coverage` require `requireSuperUser`; path traversal is blocked with `resolvedPath.startsWith(path.resolve(DOCS_DIR))`. | Internal repository docs are not public CMS content. | Keep docs viewer super-admin-only. | XS | Low |
| CMS-004 | Informational | Strongly Supported | `server/http/domains/tenantDefaultDocs.router.ts`, `server/http/domains/clientDocuments.router.ts` | Routers use `policy: "authTenant"`; admin mutation routes require admin/super access; downloads validate tenant/client scope and return presigned URLs. | Document libraries are content-like but should remain tenant/client resources. | Do not reuse these tables/routes as public publishing until a separate model exists. | S | Low |

## Changes Made

- Created `docs/12-OPERATIONS/PUBLIC_CONTENT_GOVERNANCE.md` to define the current non-CMS boundary and future CMS requirements.
- Added `server/scripts/publishing-readiness-check.cjs` as a static gate over crawler routes, super-admin docs access, document routing boundaries, and package script exposure.
- Added `server/tests/publishing-readiness-check.test.ts` to exercise the gate.
- Added `publishing:check` to `package.json`.

Compatibility: no runtime behavior, route contracts, schema, migrations, or public URLs were changed.

## Verification

Commands run:

- `npm run publishing:check`
- `npx vitest run server/tests/publishing-readiness-check.test.ts`
- `npm run production:check`
- `npm run test:ci`

## Residual Risk And Roadmap

Immediate:

- Keep public sitemap entries limited to the existing application entry points.
- Run `npm run publishing:check` before public routing, SEO, document, or docs-viewer changes.

Near term:

- If client-facing knowledge-base pages are needed, start with read-only published articles, not a general page builder.
- Add content tables with tenant ownership, slug uniqueness, immutable revisions, published revision pointers, and audit events.
- Add RBAC for edit, approve, publish, unpublish, schedule, media manage, and rollback.

Long term:

- Add authenticated preview links, scheduled publishing, redirect management, media lifecycle, cache invalidation, sitemap generation from published rows, and rollback UI.
- Add server-side sanitization for any rich HTML or embed-enabled content.

Do not pursue now:

- A drag-and-drop page builder before a simple published content model exists.
- Public exposure of default documents, client documents, notes, comments, tasks, projects, or chat as CMS blocks.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Content model | 5 | No public CMS model exists yet. |
| Identifier/slug safety | 6 | Tenant slugs exist, but page slug models do not. |
| Draft/preview/publish lifecycle | 4 | Agreement drafts and operational documents exist, but no CMS lifecycle. |
| Permissions | 8 | Existing content-adjacent routes are authenticated and tenant-scoped. |
| Media safety | 7 | Upload validation and presigned URLs exist; public/private media classification is not CMS-ready. |
| SEO/crawler control | 8 | Crawler surfaces are explicit and conservative. |
| Rollback/revisions | 5 | Operational note versions exist; no public page revision model. |
| Operability | 8 | Added a deterministic publishing readiness gate. |
