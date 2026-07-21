# AI Features, LLM Safety, and Governance Audit - 2026-07-21

## Executive Assessment

Overall score: 7.5/10.

Release recommendation: Approve with follow-up. AI features are authenticated/admin-only and optional, but broader rollout should wait until usage/cost attribution and evaluation coverage exist.

Strongest aspects:
- AI feature routes in `server/http/domains/ai.router.ts` use the `authTenant` route policy and explicitly require tenant admin access for generation endpoints.
- AI provider resolution in `server/services/ai/getAIProvider.ts` is server-side and follows tenant-specific, system-level, then environment fallback precedence.
- Employee AI summaries already use cached outputs, input hashes, tenant/user daily generation limits, and expiry through `ai_summaries`.

Most important risks:
- Legacy suggestion flows in `server/services/ai/aiService.ts` parsed model JSON with `JSON.parse(...) as Type`, trusting malformed or partial model output.
- Tenant/system OpenAI integration routes accepted loosely bounded `model`, `maxTokens`, and `temperature` values compared with the Super Admin UI.
- AI usage/cost attribution is not persisted per tenant/user/feature/model, so spend governance is still incomplete.

## System Map

AI execution surfaces inspected:
- Legacy suggestion endpoints: `/api/v1/ai/suggest/task-breakdown`, `/project-plan`, and `/task-description`.
- Cached employee-summary endpoint family in `server/http/domains/ai.router.ts`.
- System AI settings in `server/routes/modules/super-admin/ai-config.router.ts`.
- Tenant/system integration settings in `server/routes/tenantOnboarding.ts` and `server/routes/systemIntegrations.ts`.
- Provider resolution and secret handling in `server/services/ai/getAIProvider.ts` and `server/services/ai/aiService.ts`.
- Storage model for cached AI summaries in `shared/schema.ts`.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI-001 | High | Confirmed | Feature-wide | `server/services/ai/aiService.ts` | Task/project suggestion functions used `JSON.parse(content) as TaskBreakdownSuggestion` and `as ProjectPlanningSuggestion`. | Model output is untrusted JSON; malformed shape could become trusted app data or break callers unpredictably. | Added governed Zod schemas and validated AI JSON before returning it. | S | Low | `npx vitest run server/tests/ai-governance.test.ts` |
| AI-002 | Medium | Confirmed | Cross-cutting | `server/routes/tenantOnboarding.ts`, `server/routes/systemIntegrations.ts`, `server/routes/modules/super-admin/ai-config.router.ts` | Config schemas differed; some accepted arbitrary model strings and unbounded token/temperature values. | A bad config can inflate cost, degrade quality, or route requests to unsupported models. | Added shared `aiConfigUpdateSchema` and matching bounds where routes cannot directly import it. | S | Low | Typecheck and governance tests |
| AI-003 | Medium | Strongly Supported | Local | `server/services/ai/aiService.ts` | User-provided task/project/client text was interpolated directly into prompts. | Prompt injection in user content can steer outputs away from requested JSON or policy. | Added system message guidance, input bounding, and explicit XML-like data delimiters. | S | Low | Typecheck and focused tests |
| AI-004 | Medium | Strongly Supported | Systemic | `server/services/ai/*`, `docs/review/cost-efficiency-audit-2026-07-21.md` | AI calls do not persist token usage, request feature, tenant, user, model, or provider source. | Tenant cost allocation, abuse detection, and rollout limits are incomplete. | Add AI usage events before enabling broad AI workflows. | M | Low | Future usage telemetry tests |
| AI-005 | Low | Plausible | Operability | Evaluation/drift | No golden evaluation dataset or drift checks found for AI-generated project/task suggestions. | Output quality can regress silently as prompts/models/config change. | Add a small eval fixture suite for structure, refusal behavior, injection handling, and usefulness. | M | Low | Future eval command |

## Changes Made

- Added `server/services/ai/governance.ts` with:
  - allowed model list
  - token and temperature bounds
  - config update schema
  - bounded prompt input helper
  - governed JSON output schemas/parsing
  - system prompt guidance for treating user content as data
- Updated `server/services/ai/aiService.ts` to bound inputs, use system/user messages, and validate model JSON.
- Updated `server/services/ai/getAIProvider.ts` to normalize stored/env model, token, and temperature config.
- Updated Super Admin, tenant onboarding, and system integration OpenAI config routes to enforce bounded config.
- Tightened AI suggestion request schemas in `server/http/domains/ai.router.ts`.
- Added `server/tests/ai-governance.test.ts`.

Compatibility considerations: supported UI models and token ranges are preserved. Invalid stored/env values now fall back to safe defaults at runtime; invalid API updates are rejected earlier.

## Verification Results

Commands executed:
- `npx vitest run server/tests/ai-governance.test.ts`
- `npm run check`
- `npx vitest run server/tests/ai-governance.test.ts server/tests/integration/aiRoutes.test.ts`

Results:
- Governance tests passed.
- TypeScript passed.
- The DB-marked `server/tests/integration/aiRoutes.test.ts` still fails without a live `DATABASE_URL`, which is expected for that suite on this workstation.

Next verification:
- `npm run production:check`
- `npm run test:ci`

## Residual Risk And Roadmap

Immediate:
- Keep AI disabled for non-admin users and customer portal users.
- Verify any production/staging OpenAI settings use allowed models and reasonable token caps.

Near term:
- Add an `ai_usage_events` table or reuse an audit/event path to record tenant, user, feature, model, provider source, prompt tokens, completion tokens, total tokens, latency, success/failure, and request ID.
- Add eval fixtures for prompt injection attempts, malformed model JSON, overlong context, and useful task/project outputs.
- Add tenant-level daily/monthly AI spend limits before opening AI to broader tenant staff.

Long term:
- Add moderation or DLP controls if AI inputs will include client-uploaded files, chat history, or private support content.
- Add human approval workflows before AI-generated content can create tasks/projects automatically.
- Avoid tool-calling agents, autonomous actions, retrieval over private files, or client-visible AI summaries until governance, consent, audit trails, and evals are materially stronger.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Prompt construction | 8 | Delimiters and system guidance added; full eval coverage remains future work. |
| Output validation | 8 | Legacy JSON outputs now validated; employee summary validators were not deeply changed. |
| Tenant isolation | 8 | AI routes are tenant-authenticated/admin-gated; provider resolution is tenant-aware. |
| Model/config governance | 8 | Config bounds are centralized; route ecosystem still has older integration code paths. |
| Cost governance | 6 | Token caps exist; persistent usage/cost attribution is missing. |
| Privacy | 7 | Admin-only and server-side keys are good; DLP/moderation is not present. |
| Observability | 6 | Errors log; structured AI usage telemetry is incomplete. |
| Evaluation/drift | 5 | No dedicated eval dataset yet. |
