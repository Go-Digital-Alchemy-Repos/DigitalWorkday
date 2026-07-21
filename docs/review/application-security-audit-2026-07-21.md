# Application Security and Abuse-Resistance Audit - 2026-07-21

## Scope

Reviewed the main runtime security surfaces for Digital Workday:

- Authentication, password reset, invitation, and app-link generation.
- Tenant-scoped file serving, presigned upload completion, and direct memory uploads.
- Rich text, client notes, project notes, and SaaS agreement rendering.
- Stripe webhook signature verification.
- Public health and operational endpoints.
- SSRF, external fetches, CORS/CSRF posture, rate limiting, and obvious secret exposure patterns.

The review used the Engineering Excellence prompt plus a Codex Security scan with delegated slices for file/storage, rich text/content rendering, and SSRF/webhook/header/rate-limit surfaces.

## Executive Summary

Overall posture after this pass: **B / 82**

The application already has meaningful security foundations: session auth, tenant context, rate limiters on high-risk auth flows, upload validation, password reset token hashing, and prior multi-tenancy hardening. This pass found and fixed several high-value issues that could affect production users, especially private storage exposure and stored XSS risk.

The remaining security work is less about one obvious bug and more about tightening depth: DB-backed object-level file authorization, stricter production host/config enforcement, more formal security headers, and automated abuse tests for upload/invite/auth flows.

## Fixes Applied

### Private File Serving Authorization

Severity before fix: **High**

`/api/v1/files/serve/*` was mounted before tenant context and allowed any key under `tenants/`, which meant a leaked or guessed private tenant storage key could be requested without a session.

Changes:

- Moved the file-serving proxy after tenant context.
- Kept `system/`, `global/`, and tenant branding assets public.
- Required authentication for other `tenants/<tenantId>/...` keys.
- Required the authenticated effective tenant to match the tenant segment in the key.
- Added traversal rejection and focused route tests.

Residual risk:

- The fix blocks unauthenticated and cross-tenant reads. A future hardening pass should add DB-record/object-level authorization so tenant users can only stream documents/attachments they are allowed to see, not merely any key in their tenant.

### Stored XSS in Rich Text Rendering

Severity before fix: **High**

`RichTextViewer` rendered HTML strings through `dangerouslySetInnerHTML`. Client notes, project notes, history views, and agreement text could therefore become active markup if unsafe HTML reached storage.

Changes:

- Removed the raw HTML rendering branch from `RichTextViewer`.
- Routed string content through the TipTap renderer path.
- Stopped converting project note bodies to HTML before rendering.
- Replaced SaaS agreement raw HTML rendering with `RichTextRenderer`.

Residual risk:

- Legacy HTML-like note bodies now render as text instead of active HTML. If rich historical formatting needs preservation, add a sanitizer with a strict allowlist and tests before re-enabling any HTML rendering.

### Upload Completion Key Confusion

Severity before fix: **High/Medium**

Several upload completion endpoints trusted client-provided storage keys. A valid tenant user could potentially complete an upload metadata record against an unrelated key.

Changes:

- Added tenant/client prefix checks for asset uploads.
- Added prefix checks in the asset-backed document adapter.
- Added legacy client document prefix checks.
- Added tenant default-document prefix checks.

Residual risk:

- Prefix checks are a strong minimum guard. A later phase should persist a short-lived upload intent and require completion to match that exact generated key, mime type, size, and initiating user.

### Stripe Webhook Raw Body

Severity before fix: **Medium**

The webhook route used `express.raw()`, but global JSON parsing already ran before the route. Stripe signature verification could receive a parsed body rather than the signed raw bytes.

Changes:

- Webhook verification now prefers `req.rawBody` when global parsing captured it, while still supporting raw route bodies.

Residual risk:

- Add a signed Stripe webhook fixture test when test secrets are standardized.

### Host Header Poisoning in External Links

Severity before fix: **Medium**

Password reset and invitation links fell back to `req.get("host")` when `APP_PUBLIC_URL` was missing. A forged Host header could poison emailed links.

Changes:

- Password reset and invite links now use `buildAppUrl`.
- `getAppBaseUrl` now trusts configured `APP_PUBLIC_URL`/`APP_URL` first.
- Request-host fallback is restricted to a default trusted host list or `APP_ALLOWED_HOSTS`.
- Added app-link tests for arbitrary and explicitly allowed hosts.

Residual risk:

- Production and staging should keep `APP_PUBLIC_URL` set explicitly. `APP_ALLOWED_HOSTS` should be maintained alongside deployed domains.

### Served SVG Active Content

Severity before fix: **Medium**

Existing SVG branding files could be served from the app origin. If an SVG contained script and was opened directly, it could become active same-origin content.

Changes:

- File serving now sends `X-Content-Type-Options: nosniff`.
- SVG responses now include a restrictive CSP sandbox header with scripts disabled.

Residual risk:

- Best long-term option is serving user-controlled assets from a cookieless asset origin or sanitizing/disallowing SVG for uploads.

### Memory Upload Backpressure

Severity before fix: **Medium**

The unified upload proxy used memory storage without a multer file-size cap.

Changes:

- Added a 25 MB multer file-size limit to align with the existing upload validation ceiling.

Residual risk:

- Larger uploads should remain presigned-direct-to-storage only.

## Additional Findings Not Fixed In This Pass

### Detailed Public DB Health Endpoint

Severity: **Low/Medium**

`/api/v1/system/health/db` is public and returns DB latency, pool stats, migration count, and error details. This is operationally useful, but it can help attackers fingerprint system state.

Recommendation:

- Keep public `/health` minimal.
- Gate detailed DB health behind an observability/admin control or a Railway-only/internal check.

### Object-Level File Authorization

Severity: **Medium**

The file proxy now enforces tenant boundaries, but not document/project/client membership for every private object.

Recommendation:

- Resolve the requested storage key to its owning DB record.
- Authorize through the same client/project/task access checks used by the normal API route.
- Return 404 for objects without an authorized DB record.

### Upload Intent Binding

Severity: **Medium**

Prefix checks prevent broad key confusion but do not prove that the completing user is completing the exact key they just presigned.

Recommendation:

- Store upload intents with key, tenant, client/folder, user, mime type, size, checksum, and expiration.
- Mark the intent consumed on completion.

### Security Header Policy

Severity: **Low/Medium**

The app has targeted headers, but no centralized full response security policy was confirmed in this pass.

Recommendation:

- Add a global security-header middleware or Helmet configuration.
- Include CSP, frame-ancestors, referrer-policy, permissions-policy, nosniff, and HSTS in production.

## Verification

Completed locally:

- `npx vitest run server/tests/file-serve-security.test.ts server/tests/auth-session-security.test.ts server/tests/app-links.test.ts`
- `npm run check`
- `npm test`
- `npm run test:client`
- `npm run build`
- `npm audit --omit=dev`
- `git diff --check`

## Recommended Roadmap

1. Add DB-record authorization to `/api/v1/files/serve/*`.
2. Add upload-intent persistence and exact-match completion.
3. Gate detailed health/diagnostics endpoints.
4. Add centralized production security headers.
5. Add signed webhook fixture tests.
6. Decide SVG policy: sanitize, disallow, or isolate on a cookieless asset domain.
