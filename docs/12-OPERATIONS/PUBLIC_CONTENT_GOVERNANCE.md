# Public Content Governance

Digital Workday is currently an authenticated SaaS application, not a public CMS or page-builder platform. The only intentional public web surfaces are the application shell, login and password-reset entry points, public invite acceptance endpoints, health checks, OAuth/vendor compliance pages, and crawler metadata files.

## Current Boundary

- Public crawler files live in `server/static.ts`: `/robots.txt`, `/sitemap.xml`, and `/llms.txt`.
- The sitemap allowlist is intentionally narrow: `/`, `/login`, and `/auth/forgot-password`.
- Authenticated workspace, client portal, super-admin, task, project, report, chat, document, file, and API surfaces must not be added to public crawler indexes.
- Repository documentation is readable through the super-admin docs viewer only. It is operational documentation, not public publishing content.
- Tenant default documents and client documents are authenticated tenant/client resources. Downloads must continue to use tenant-scoped checks and short-lived presigned URLs.

## Required Model Before Public CMS Work

Before adding public pages, blog posts, marketing pages, help-center articles, tenant-branded microsites, or a drag-and-drop page builder, the system needs an explicit publishing model:

- Content identity: stable IDs, tenant ownership, unique slug constraints per tenant/site, canonical URL fields, and redirect records.
- Lifecycle: draft, review, scheduled, published, archived, and deleted states with timestamps and actor IDs.
- Versioning: immutable revisions, restore/rollback, published revision pointers, and audit events.
- Permissions: separate create, edit, approve, publish, unpublish, schedule, media-manage, and rollback permissions.
- Preview: authenticated preview URLs that never leak unpublished content to crawlers.
- Atomic publish: publish should update page body, metadata, sitemap inclusion, redirects, and cache invalidation as one logical operation.
- Sanitization: rich HTML/embedded content must be server-sanitized with an allowlist before it can become public.
- Media: uploaded media must have explicit public/private classification, size/type validation, ownership, replacement history, and deletion behavior.
- Cache and search: sitemap, robots, answer-engine guidance, CDN cache invalidation, and indexing metadata must derive from published records only.

## Explicit Non-Goals For Now

- Do not repurpose the super-admin docs viewer into public documentation.
- Do not expose client documents, default docs, notes, comments, tasks, projects, or chat messages as public page-builder blocks.
- Do not add broad public wildcard routes such as `/pages/:slug` or `/docs/:slug` without the publishing model above.
- Do not index tenant or client portal URLs in `/sitemap.xml`.

## Verification

Run this gate after content-routing or public metadata changes:

```bash
npm run publishing:check
```

The check is deliberately static. It does not prove a future CMS is complete; it protects the current production boundary until that CMS exists.
