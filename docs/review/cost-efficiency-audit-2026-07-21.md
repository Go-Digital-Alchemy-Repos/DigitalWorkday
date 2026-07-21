# Infrastructure Cost and Resource-Efficiency Audit - 2026-07-21

## Executive Assessment

Overall score: 8/10.

Release recommendation: Approve with follow-up. The current pilot can run cost-effectively on a simple Railway shape, provided DB pool caps from the scalability pass are set explicitly and live usage is watched during portal validation.

Strongest aspects:
- Build output uses hashed asset filenames in `dist/public/assets`, which supports aggressive browser caching without risking stale deploy shells.
- Database capacity is now configurable through `DB_POOL_MAX`, `DB_POOL_MIN`, `SESSION_DB_POOL_MAX`, and `SESSION_DB_POOL_MIN`.
- Optional cost-bearing integrations are feature/config gated: R2, Mailgun, Stripe, OpenAI, forecasting alerts, weekly digests, and retention jobs are not unconditional runtime spend.

Most important risks:
- Static assets were previously served through `express.static(distPath)` with default cache behavior, creating avoidable repeat egress and app work for hashed bundles.
- AI usage has per-call `max_tokens`, but the repository does not yet record token usage or cost attribution per tenant.
- Storage lifecycle and restore drills are documented, but no repository evidence was found for automated R2 object lifecycle policies or dated cleanup reports.

## System Map

Cost-sensitive surfaces inspected:
- Compute and startup: `railway.toml`, `Dockerfile`, `script/build.ts`, `server/scripts/deploy-smoke.cjs`.
- Database: `server/db.ts`, `server/auth.ts`, `server/dbPoolConfig.ts`, `/readyz`, report pagination helpers.
- Network egress/static assets: `server/static.ts`, Vite build output naming from `npm run build`.
- Storage/media: `server/services/uploads/s3UploadService.ts`, `server/services/uploads/imageProcessor.ts`, `server/services/chatExport.service.ts`.
- Third-party APIs: `server/services/ai/*`, `server/services/tenantIntegrations.ts`, `server/services/asana/asanaClient.ts`, `server/services/emailOutbox.ts`.
- Logging/observability: request logging exclusions, perf/query telemetry flags, SLO and production readiness scripts.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| COST-001 | Medium | Confirmed | Cross-cutting | `server/static.ts` | Production static serving used `app.use(express.static(distPath))` with no cache policy. Build output uses hashed asset files such as `assets/index-H-Z1mW3g.js`. | Repeat browser loads can hit the app and consume bandwidth for assets that are safe to cache for a year. | Added immutable one-year cache headers for `/assets/*`, kept `index.html` revalidatable, and gave other static files a short cache. | XS | Low | `npx vitest run server/tests/static-cache.test.ts` |
| COST-002 | Medium | Strongly Supported | Systemic | `server/services/ai/getAIProvider.ts`, `server/services/ai/aiService.ts` | Environment fallback defaults to `gpt-4o-mini` and `OPENAI_MAX_TOKENS=2000`; AI calls do not persist usage/cost telemetry. | Tenant-by-tenant AI cost cannot be allocated or capped from current evidence. | Add usage logging around AI completions before enabling broad AI features. | M | Low | Future AI usage telemetry test |
| COST-003 | Low | Strongly Supported | Feature-wide | `server/services/uploads/s3UploadService.ts`, `shared/schema.ts` retention tables | Uploads use R2-style storage paths and retention tables exist, but lifecycle enforcement evidence was not found in this pass. | R2 storage can grow invisibly as client files, avatars, chat exports, and attachments accumulate. | Add a storage inventory/lifecycle report before inviting many portal users. | M | Low | Future R2 inventory report |
| COST-004 | Low | Strongly Supported | Operability | `server/dbPoolConfig.ts`, docs | Connection caps are configurable, but live Railway plan limits are external. | Overprovisioned replicas or pool caps can create DB cost/saturation without improving throughput. | Set pool caps per environment and track `/readyz.pool.waiting` during rollout. | XS | Low | Railway metrics and SLO probe |

## Changes Made

- Updated `server/static.ts` to set cache headers for production static files:
  - `/assets/*`: `public, max-age=31536000, immutable`
  - `index.html`: `no-cache`
  - other static files: `public, max-age=3600`
- Added `server/tests/static-cache.test.ts`.
- Added this cost-efficiency review report.

Compatibility considerations: the SPA shell remains revalidatable, so deployments can still ship new asset references immediately. Hashed assets are safe for immutable caching because Vite changes filenames when content changes.

## Verification Results

Commands executed:
- `npx vitest run server/tests/static-cache.test.ts`
- `npm run production:check`
- `npm run test:ci`

Expected remaining gaps:
- Live egress reduction needs production/staging traffic measurement after deploy.
- AI and R2 cost attribution require new runtime telemetry or provider-side export.

## Residual Risk And Roadmap

Immediate:
- Push the queued commits once GitHub auth has `workflow` scope.
- Confirm Railway production and staging use explicit DB pool caps.
- After deploy, validate asset responses with `curl -I https://<host>/assets/<bundle>.js`.

Near term:
- Add per-tenant AI usage/cost records for prompt tokens, completion tokens, model, source feature, and request user.
- Add an R2 inventory report by tenant, object category, object count, total bytes, and stale-object candidates.
- Add cost notes to the launch checklist: expected Railway replicas, DB plan, R2 bucket, Mailgun, Stripe, OpenAI, and monthly owner.

Long term:
- Add storage lifecycle automation only after the report shows real accumulation.
- Add queue/backlog workers only after background workload begins delaying interactive requests.
- Avoid premature reserved capacity, multi-region deployments, read replicas, or CDN rules beyond immutable static asset caching until measured traffic supports it.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Compute efficiency | 8 | Startup/build path is lean; live Railway sizing still needs measurement. |
| Database efficiency | 8 | Pool caps exist; query-plan evidence at 100x data remains future work. |
| Network egress | 8 | Static asset caching fixed; provider egress still needs observation. |
| Storage efficiency | 7 | Tenant-isolated storage exists; lifecycle/inventory report is not yet automated. |
| Third-party API cost | 7 | Integrations are gated; AI token attribution is missing. |
| Logging volume | 8 | Health routes are excluded from noisy request logging; production log volume should be watched live. |
| Cost allocation | 6 | Tenant-level billing/cost attribution is incomplete for AI and storage. |
