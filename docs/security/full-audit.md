# Security Audit — Full Checklist

**Last updated:** 2026-02-19
**Scope:** Server-side (Express, Socket.IO, PostgreSQL), client-side (React SPA)

---

## 1. Authentication & Sessions

| Control | Status | Notes |
|---|---|---|
| Password hashing: scrypt, 64-byte output, random salt | PASS | `server/auth.ts` — `hashPassword()` |
| Timing-safe password comparison | PASS | Uses `crypto.timingSafeEqual` |
| Session stored server-side (PostgreSQL `user_sessions`) | PASS | `connect-pg-simple` store |
| `SESSION_SECRET` required in production (fail-fast) | PASS | Throws on missing env var |
| Session cookie: `httpOnly` | PASS | Prevents XSS cookie theft |
| Session cookie: `secure` in production | PASS | HTTPS-only in prod |
| Session cookie: `sameSite: lax` | PASS | CSRF defence layer |
| Session cookie: `path: /` | PASS | Scoped to root |
| Session cookie name: `__Host-` prefix in production | PASS | Added 2026-02-19 — prevents domain-scoping attacks |
| `passwordHash` never serialised to client | PASS | Stripped in serialise/deserialise and all API responses |
| Deactivated accounts rejected at login | PASS | `isActive` check in Passport strategy |
| First-user bootstrap isolated to dedicated endpoint | PASS | `/api/v1/auth/bootstrap-register` |

## 2. Rate Limiting (Brute Force Protection)

| Endpoint | Limiter | Status |
|---|---|---|
| `POST /api/auth/login` | `loginRateLimiter` (IP + email combined) | PASS |
| `POST /api/auth/register` | `userCreateRateLimiter` | PASS — Added 2026-02-19 |
| `POST /api/v1/auth/bootstrap-register` | `bootstrapRateLimiter` | PASS |
| `POST /api/v1/auth/platform-invite/accept` | `inviteAcceptRateLimiter` | PASS |
| `POST /api/v1/public/invites/accept` | `inviteAcceptRateLimiter` | PASS |
| `POST /api/v1/auth/forgot-password` | `forgotPasswordRateLimiter` (IP + email) | PASS |
| `POST /api/v1/auth/reset-password` | `inviteAcceptRateLimiter` | PASS |
| Upload presign/proxy | `uploadRateLimiter` | PASS |
| Chat send | `chatSendRateLimiter` | PASS |
| Client portal messages | `clientMessageRateLimiter` | PASS |
| Invite creation | `inviteCreateRateLimiter` | PASS |

All rate-limit responses now use `req.requestId` (not a generated ID) and log structured events via the `rate-limit` logger.

## 3. CSRF Protection

| Control | Status | Notes |
|---|---|---|
| Origin/Referer header validation on mutating methods | PASS | `server/middleware/csrf.ts` |
| GET/HEAD/OPTIONS exempted (safe methods) | PASS | Correct per RFC |
| Webhook routes exempted (signature-verified) | PASS | `/api/webhooks/`, `/api/v1/webhooks/` |
| Health endpoints exempted | PASS | `/health`, `/healthz`, `/ready` |
| Missing origin with `application/json` allowed | INFO | Trade-off: allows Postman/cURL but blocks form-based CSRF |
| Development localhost origins allowed | PASS | Dev-only relaxation |
| CSRF blocks logged via structured logger | PASS | Added 2026-02-19 |

## 4. Input Validation

| Area | Status | Notes |
|---|---|---|
| Migrated domain routers use `validateBody` (Zod) | PASS | Tags, comments, projects, tasks, subtasks, chat, teams, workspaces |
| Auth endpoints validate required fields manually | PASS | Email, password presence + password length check |
| Upload presign validates schema with Zod | PASS | `presignRequestSchema` in uploads router |
| CRM routers use `validateBody` | PASS | Conversations, files, notes, contacts, approvals |
| JSON body size limit | PASS | Reduced from 200 MB to 10 MB (2026-02-19) |

### Recommendations
- Consider adding email format validation (regex or Zod `.email()`) on registration and login endpoints.
- Consider maximum field length constraints on free-text fields (project names, descriptions) to prevent storage abuse.

## 5. File Upload Security

| Control | Status | Notes |
|---|---|---|
| Category-based MIME allowlists | PASS | `s3UploadService.ts` — per-category `allowedMimeTypes` |
| Category-based size limits | PASS | e.g., logos 2 MB, favicons 512 KB |
| Dangerous extension blocklist (`.exe`, `.bat`, etc.) | PASS | `uploadGuards.ts` — `DANGEROUS_EXTENSIONS` |
| Filename sanitisation (traversal, special chars) | PASS | `sanitizeFilename()` strips `../`, special chars |
| Path traversal detection | PASS | Blocks `..`, `/`, `\\` in filenames |
| Upload guard mode: `enforce` in production | PASS | Changed default from `warn` to `enforce` in prod (2026-02-19) |
| R2 keys generated server-side (no client control) | PASS | Prevents arbitrary key injection |
| Presigned URL expiry | PASS | 5-minute TTL |
| Server-side tenant isolation in R2 key namespace | PASS | Keys include `tenantId` segment |

## 6. Tenant Data Isolation

| Control | Status | Notes |
|---|---|---|
| `tenantContextMiddleware` applied globally | PASS | Sets `req.tenant` from session |
| `authTenant` policy on all domain routers | PASS | Requires auth + tenant context |
| DB queries scoped with `tenantId` WHERE clause | PASS | Verified in migrated routers (tasks, projects, chat, etc.) |
| `tenancyEnforcement` middleware (off/soft/strict) | PASS | Configurable enforcement mode |
| Super admin routes on `/api/v1/super` with `superUser` policy | PASS | Isolated from tenant routes |
| Tenant onboarding on `/api/v1/tenant` with `authOnly` | PASS | No tenant required during onboarding |
| Impersonation audit logged | PASS | Session tracks `originalSuperUserId` |

### Public Endpoint Audit
| Endpoint | Exposes Tenant Data? | Notes |
|---|---|---|
| `/health`, `/healthz`, `/ready`, `/api/health` | NO | System status only |
| `/api/v1/auth/bootstrap-status` | NO | Returns boolean flag |
| `/api/v1/public/invites/accept` | NO | Invite token lookup only |
| `/api/auth/register` | NO | Creates user, no data exposure |
| `/api/v1/auth/forgot-password` | NO | Generic response regardless of email existence |
| `/api/v1/auth/reset-password` | NO | Token-based, no enumeration |
| `/api/v1/webhooks/*` | NO | Signature-verified, no query responses |

## 7. Error Handling & Information Disclosure

| Control | Status | Notes |
|---|---|---|
| Stack traces suppressed in production responses | PASS | `errorHandler.ts` — isProduction check |
| DB error details normalised | PASS | PostgreSQL codes mapped to generic messages |
| Error handler never throws | PASS | Try-catch with absolute fallback |
| Secret redaction in error logs | PASS | `errorLogging.ts` — pattern-based redaction |
| Request ID in all error responses | PASS | For correlation |

## 8. Observability & Logging

| Control | Status | Notes |
|---|---|---|
| Structured JSON logger | PASS | `server/lib/logger.ts` — timestamp, level, source, requestId |
| Request logging with timing | PASS | `requestLogger.ts` — durationMs, status, path |
| Rate limit events logged | PASS | All triggers logged with limiter name, IP, path |
| CSRF blocks logged | PASS | Origin mismatch events with request context |
| Socket auth events logged | PASS | Connection, auth success/failure, disconnect |
| Health checks excluded from logs | PASS | Reduces noise |
| Performance timing helpers | PASS | `perfMark()`, `perfMs()`, `apiPerfLog()` |

## 9. Transport Security

| Control | Status | Notes |
|---|---|---|
| `trust proxy` set to 1 | PASS | Correctly trusts single reverse proxy |
| Secure cookies in production | PASS | `secure: true` when `NODE_ENV=production` |
| CORS configured on Socket.IO | INFO | Currently `origin: '*'` — restrict in production |

### Recommendations
- Restrict Socket.IO CORS `origin` to the application domain in production.
- Consider adding `Strict-Transport-Security` (HSTS) header for production deployments.
- Consider adding `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` headers.

## 10. Summary of Changes (2026-02-19)

| Change | File | Impact |
|---|---|---|
| Added `userCreateRateLimiter` to `/api/auth/register` | `server/auth.ts` | Prevents registration brute-force |
| Session cookie name `__Host-sid` in production | `server/auth.ts` | Prevents domain-scoping attacks |
| Cookie `path: /` explicitly set | `server/auth.ts` | Defence-in-depth |
| Logout clears correct cookie name | `server/auth.ts` | Matches new cookie name |
| JSON body limit reduced 200 MB → 10 MB | `server/index.ts` | Prevents request-size abuse |
| Upload guard default mode: `enforce` in production | `server/http/middleware/uploadGuards.ts` | Blocks unsafe files in prod |
| CSRF block logging via structured logger | `server/middleware/csrf.ts` | Observable CSRF events |
| Rate limit handlers use `req.requestId` | `server/middleware/rateLimit.ts` | Consistent request correlation |
| Rate limit events logged via structured logger | `server/middleware/rateLimit.ts` | Observable rate limit events |
| Socket auth events use structured logger | `server/realtime/socket.ts` | Observable socket lifecycle |

## 11. Open Recommendations (Non-Blocking)

1. **Socket.IO CORS**: Restrict `origin` from `*` to app domain(s) in production.
2. **Security Headers**: Add HSTS, `X-Content-Type-Options`, `X-Frame-Options` via middleware or reverse proxy.
3. **Email Validation**: Add Zod `.email()` validation on auth endpoints.
4. **Account Lockout**: Consider temporary account lockout after N failed login attempts (in addition to rate limiting).
5. **Session Rotation**: Call `req.session.regenerate()` after successful login to prevent session fixation.
6. **CSP Header**: Add Content-Security-Policy header for the SPA.
7. **Dependency Audit**: Run `npm audit` periodically to check for known vulnerabilities in dependencies.
