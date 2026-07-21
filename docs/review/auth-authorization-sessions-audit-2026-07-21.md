# Authentication, Authorization, and Session Security Audit - 2026-07-21

## Executive Assessment

Overall score: 8/10 after remediation.

Release recommendation: Approve with follow-up.

Strongest aspects:

- Authentication is centralized in `server/auth.ts` with Passport local and Google OAuth strategies, PostgreSQL-backed sessions, and password hashes stripped before serialization.
- Production session configuration is hardened: `SESSION_SECRET` is fail-fast required, cookies use `httpOnly`, production `secure`, `sameSite: "lax"`, path `/`, and the production cookie name is `__Host-sid`.
- Token flows use hashed reset/invite tokens, short reset-token expiry, rate-limited auth endpoints, Google verified-email checks, and app-level CSRF origin validation in `server/middleware/csrf.ts`.

Most important risks:

- High, fixed: successful login and invite/bootstrap auto-login paths did not rotate the session id before attaching Passport state.
- Medium, follow-up: password reset completion changes the password but does not invalidate existing sessions for that user.
- Medium, follow-up: MFA is not implemented; this is acceptable for the current pilot if admin access is tightly controlled, but it should be planned before broader rollout.

## System Map

Digital Workday is an Express + TypeScript application with React/TanStack Query on the frontend and PostgreSQL via Drizzle on the backend. Railway builds with `npm run build` and starts the server from `dist/index.cjs`.

Relevant auth flow:

1. `server/index.ts` installs CSRF origin validation before route registration.
2. `setupAuth(app)` in `server/auth.ts` installs `express-session`, Passport initialization, and Passport sessions.
3. Local login uses Passport `LocalStrategy`, validates active users and password hashes, resolves workspace access, then establishes an authenticated session.
4. Google OAuth uses `passport-google-oauth20`, requires configured OAuth variables, verified Google email, and an allowed Google domain before establishing a session.
5. Invite acceptance and bootstrap registration create or activate accounts and auto-login through the same session establishment helper.
6. Route-level authorization is enforced through `requireAuth`, `requireAdmin`, super-admin middleware, tenant context middleware, and route policy wrappers in `server/http/policy/requiredMiddleware.ts`.

Inspected areas:

- Auth/session core: `server/auth.ts`, `server/config.ts`, `server/index.ts`
- CSRF/rate limiting: `server/middleware/csrf.ts`, `server/middleware/rateLimit.ts`
- Authorization/tenant policy: `server/http/policy/requiredMiddleware.ts`, `server/middleware/tenantContext.ts`, `server/middleware/authContext.ts`
- Super-admin boundaries and impersonation: `server/routes/modules/super-admin/*.ts`
- Token schema and session storage: `shared/schema.ts`, `server/storage.ts`, `server/utils/userDeletion.ts`
- Tests/docs: auth, platform admin, bootstrap, Google domain, rate limit, diagnostics, security and auth docs

## Findings

| ID | Severity | Confidence | Location | Evidence | Why It Matters | Remediation | Effort | Risk | Verification |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | High | Confirmed | `server/auth.ts` login, Google callback, bootstrap, platform invite, tenant invite accept paths | The previous code called `req.logIn` / `req.login` directly and then saved `req.session.workspaceId`; no `req.session.regenerate()` was present. | If an attacker can fix or reuse a pre-auth session id, successful authentication should rotate the id before privileged state is stored. | Added `establishAuthenticatedSession()` and routed all successful auth-boundary auto-login paths through session regeneration, Passport login, workspace assignment, and save in that order. | S | Moderate | New `server/tests/auth-session-security.test.ts`; full type/test/build suite. |
| AUTH-02 | Medium | Confirmed | `server/auth.ts` reset-password endpoint, `server/storage.ts#invalidateUserSessions` | Password reset updates `users.passwordHash` and marks the token used, but does not call session invalidation. Existing admin reset paths do invalidate sessions. | A stolen or forgotten active session can remain valid after a password reset. | Add `storage.invalidateUserSessions(updatedUser.id)` after successful user-initiated reset. Do this in a separate small change because it affects active user experience. | XS | Low | Add reset-password regression test with a mocked or test session row. |
| AUTH-03 | Medium | Confirmed | Auth feature set | Search found no MFA/TOTP/two-factor implementation. | Super-user and admin accounts protect production tenant data; MFA lowers account takeover risk. | Add optional MFA for super users/admins before wider rollout; avoid blocking the single-tenant pilot unless business risk changes. | L | Moderate | New enrollment, recovery, login challenge, and lockout tests. |
| AUTH-04 | Low | Confirmed | `server/routes/modules/super-admin/tenant-users.router.ts`, `server/routes/users.router.ts` | Some older password reset/admin session invalidation SQL still uses `sess::text LIKE`, while `server/storage.ts#invalidateUserSessions` uses JSON operators. | Text matching is less robust than the dedicated storage helper. | Replace direct deletes with `storage.invalidateUserSessions()` in a cleanup pass. | S | Low | Existing user reset tests plus a JSON-shaped session regression. |

## Changes Made

- `server/auth.ts`: added `establishAuthenticatedSession()` and used it for local login, Google OAuth callback, bootstrap auto-login, platform invite acceptance, and tenant/client invite acceptance.
- `server/tests/auth-session-security.test.ts`: added regression coverage that proves session regeneration happens before Passport login and session save, and that login stops if rotation fails.
- `docs/review/auth-authorization-sessions-audit-2026-07-21.md`: added this evidence-backed audit and roadmap.

Compatibility:

- Public routes, response shapes, cookie names, expiration, OAuth destinations, and invite/reset token contracts remain unchanged.
- Existing fallback behavior for account creation with failed auto-login is preserved.
- Users get a new session id at successful authentication boundaries, which is the intended security behavior.

## Verification Results

Completed:

- `npx vitest run server/tests/auth-session-security.test.ts` - passed, 2 tests
- `npx vitest run server/tests/auth-session-security.test.ts server/tests/rate_limit_does_not_break_normal_login.test.ts server/tests/rate_limit_triggers_429.test.ts server/tests/google-domain.test.ts server/tests/auth-diagnostics.test.ts` - passed, 5 files / 29 tests
- `npm run check` - passed
- `npm test` - passed, 66 files / 638 tests
- `npm run test:client` - passed, 25 files / 157 tests
- `npm run build` - passed
- `npm audit --omit=dev` - passed, 0 vulnerabilities

Known local gap:

- A broader direct run including `server/tests/platform-admins.test.ts` and `server/tests/bootstrap-endpoints.test.ts` failed on this workstation because local Postgres is not running (`ECONNREFUSED 127.0.0.1:5432`). The repository's standard `npm test` fast suite completed successfully.

## Residual Risk and Roadmap

Immediate:

1. Keep all future auto-login flows routed through `establishAuthenticatedSession()`.
2. Replace remaining direct auth-session writes with the helper if new auth paths are introduced.
3. Invalidate existing sessions after user-initiated password reset.

Near-term:

1. Replace direct `user_sessions` text-match deletes with `storage.invalidateUserSessions()`.
2. Add route-policy tests for any newly introduced auth endpoints.
3. Add structured security events for session regeneration/save failures without logging session ids or tokens.

Long-term:

1. Add MFA for super users and tenant admins before broad customer rollout.
2. Consider shorter idle session expiry or sliding-session policy once power-user workflow expectations are measured.
3. Do not introduce a broad auth framework rewrite now; Passport/session auth is understandable, tested, and deployable.

## Final Scorecard

| Dimension | Score | Deduction |
|---|---:|---|
| Login/session creation | 9 | Session fixation gap fixed; helper coverage added. |
| Logout/revocation | 8 | Logout destroys current session; reset-password session invalidation still needs a follow-up. |
| Cookie security | 9 | Production `__Host-sid`, secure, httpOnly, SameSite Lax; relies on Railway HTTPS/proxy correctness. |
| Token security | 9 | Invite/reset tokens are hashed and expiration/status checked. |
| Rate limiting | 9 | Login, bootstrap, invite accept, forgot/reset flows are rate limited. |
| Role/admin boundaries | 8 | Strong route guards and recent tenant policy hardening; old admin reset SQL cleanup remains. |
| CSRF protection | 8 | Origin validation exists; JSON requests without Origin in production are allowed for compatibility. |
| MFA/readiness | 6 | MFA absent and should be planned before broader rollout. |
| Test coverage | 8 | Broad fast suite plus focused session regression; DB-dependent direct suites need local Postgres. |
