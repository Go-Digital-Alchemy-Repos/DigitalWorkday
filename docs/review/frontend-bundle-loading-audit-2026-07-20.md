# Frontend Bundle, Loading, and Delivery Audit

Date: 2026-07-20

Scope: Vite client build output, route splitting, dynamic imports, prefetch strategy, large chunks, third-party delivery, assets, and client/server leakage risk.

## Executive Assessment

Overall score: 7/10.

Release recommendation: approve with follow-up.

The frontend has a healthy route-splitting foundation. Tenant, super-admin, client portal, and auth route trees are lazily loaded, and large feature modules such as reports, chat side panels, media previews, emoji picker, and timer drawers are already behind dynamic imports. The largest remaining problem is not one broken loading path; it is that the shared app shell/vendor chunk is still large and the post-login prefetch plan was warming a heavy chat route for every tenant user.

This review made one safe delivery change: tenant route prefetching now uses an explicit byte budget and no longer prefetches chat by default. Chat still loads on demand when the user navigates there.

## Three Strongest Aspects

- Route layouts are split by app mode in `client/src/App.tsx`: tenant, super-admin, and client portal layouts are lazy-loaded.
- Route-level pages are lazy-loaded in `client/src/routing/tenantRouter.tsx`, `client/src/routing/superRouter.tsx`, `client/src/routing/portalRouter.tsx`, and `client/src/routing/authRouter.tsx`.
- Heavy optional UI is already dynamically imported, including chat context/thread panels, chat media previews, emoji picker, reports tabs, and start-timer drawers.

## Three Most Important Risks

- The largest generic JS chunk remains over budget: `dist/public/assets/index-BZfjxiBh.js` is about 562 KB raw and 161.80 KB gzip.
- The default CSS bundle is broad: `dist/public/assets/index-CtmMHX6d.css` is about 181.51 KB raw and 28.71 KB gzip.
- Several feature chunks remain large enough to deserve focused decomposition: `CommentEditor` about 412 KB raw, `BarChart` about 378 KB raw, `emoji-picker-react` about 309 KB raw, and `client-detail` about 266 KB raw.

## System Map

Build and delivery:
- Vite 7.3.6 builds the client from `client/` into `dist/public`.
- `script/build.ts` runs Vite for the client and esbuild for the server bundle.
- Railway deploys from `main` and serves the generated production build.

Loading boundaries:
- `client/src/App.tsx` lazy-loads tenant, super-admin, and client portal route layouts.
- `client/src/routing/tenantRouter.tsx` lazy-loads tenant routes.
- `client/src/routing/superRouter.tsx` lazy-loads super-admin routes.
- `client/src/routing/portalRouter.tsx` lazy-loads client portal routes.
- `client/src/routing/authRouter.tsx` lazy-loads auth/onboarding routes.
- `client/src/lib/prefetch.ts` warms selected tenant routes after login or tenant impersonation.

Generated/build artifacts inspected:
- `dist/public/assets/*`
- Vite build output
- Route and dynamic import source
- Static image/font-like assets under `client`, `public`, and `attached_assets`

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Recommended remediation | Effort | Risk | Verification |
|---|---|---|---|---|---|---|---|---|---|
| FL-01 | Medium | Confirmed | `client/src/lib/prefetch.ts` | Default tenant prefetch included `@/pages/chat`; build emitted `chat-WQi1Xgfj.js` at 124,679 bytes raw / 31,999 bytes gzip. | All tenant users paid idle network cost for chat even if they never opened chat. | Replaced fixed-count prefetching with an explicit 250 KB route budget and excluded chat by default. | XS | Low | `npx vitest run client/src/__tests__/prefetch_budget.test.ts`; `npm run build`. |
| FL-02 | Medium | Confirmed | `dist/public/assets/index-BZfjxiBh.js` | Largest generic JS asset is about 562 KB raw / 161.80 KB gzip; Vite warns one chunk exceeds 500 KB. | The app shell/shared vendor payload is the main first-load budget pressure. | Measure with a visualizer before manual chunking; likely candidates are React/Radix/socket/query shared vendor groups. | M | Moderate | Build analyzer and browser waterfall. |
| FL-03 | Medium | Confirmed | `dist/public/assets/CommentEditor-Du10vxqc.js`, `BarChart-Bhk8lRjl.js`, `emoji-picker-react.esm-Cz6FzK9M.js` | Heavy feature chunks are about 412 KB, 378 KB, and 309 KB raw. | These are acceptable when lazy, but expensive on first interaction with comments, chart-heavy reports, or emoji. | Keep lazy boundaries; next optimize rich text editor and chart loading at feature entry points. | M | Moderate | Build output plus targeted route interaction tests. |
| FL-04 | Low | Confirmed | `vite.config.ts` | No `manualChunks`, chunk-size budget, sourcemap/visualizer script, or explicit bundle budget exists. | The build warns but does not give an enforceable budget or contributor guidance. | Add an analyzer script or budget check after current stability work; avoid arbitrary chunk splitting without measurement. | S | Low | CI budget script. |
| FL-05 | Low | Confirmed | `attached_assets/*` | Several local PNG screenshots exceed 100 KB, including 634 KB and 601 KB images. | These are not necessarily shipped unless imported, but they are easy to accidentally pull into the client. | Keep screenshots out of runtime imports; convert any user-facing large image to WebP/AVIF before use. | S | Low | Asset import scan and build output. |
| FL-06 | Informational | Confirmed | `client/src` and route source | No remaining root feature barrel imports were found; no obvious third-party analytics script tags were found. | This reduces accidental bundle coupling and third-party delivery risk. | Maintain with existing boundary checks; add bundle analyzer before larger frontend work. | XS | Low | `rg` scans and build. |

## Changes Made

- Modified `client/src/lib/prefetch.ts`:
  - Replaced fixed `MAX_PREFETCH_OPS` route selection with a default 250 KB prefetch budget.
  - Added named route module metadata with estimated built chunk sizes.
  - Default prefetch now warms `tenant-router`, `home`, `my-tasks`, `projects-dashboard`, and `my-time`.
  - Chat is excluded from default prefetch but can be included by raising the budget.
- Added `client/src/__tests__/prefetch_budget.test.ts`:
  - Verifies the default prefetch plan excludes chat.
  - Verifies chat can be selected with a higher explicit budget.

Compatibility considerations: no routes, permissions, API calls, or UI behavior changed. The only behavior change is reduced idle background prefetch after login/tenant impersonation.

## Performance Budget

Proposed near-term budget:
- Default post-login tenant prefetch: <= 250 KB raw JS route chunks.
- Initial generic app shell JS: target <= 500 KB raw and <= 150 KB gzip.
- Individual route chunks: target <= 250 KB raw, with documented exceptions for rich text, charts, and admin/reporting surfaces.
- Async interaction chunks: target <= 150 KB gzip per interaction.
- CSS entry bundle: target <= 175 KB raw before further CSS pruning.

Current measured output:
- JS assets: 198.
- CSS assets: 2.
- JS assets over 500 KB raw: 1.
- Largest generic JS: about 562 KB raw / 161.80 KB gzip.
- Chat route chunk: 124,679 bytes raw / 31,999 bytes gzip, now excluded from default prefetch.

## Verification Results

Initial targeted verification:
- `npx vitest run client/src/__tests__/prefetch_budget.test.ts`: passed, 2 tests.
- `npm run check`: passed.
- `npm run build`: passed.

Full verification:
- `git diff --check`: passed.
- `npm run check`: passed.
- `npm test`: passed, 59 files and 616 tests.
- `npm run test:client`: passed, 22 files and 150 tests.
- `npm run build`: passed.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.

Residual build warnings: existing Browserslist data age warning, Tailwind ambiguous arbitrary variant warnings, PostCSS `from` option warning, and one generic JS chunk over 500 KB. The chunk warning is documented as follow-up rather than silenced.

## Residual Risk and Roadmap

Immediate:
- Keep default tenant route prefetch under the 250 KB raw budget.
- Do not prefetch chat, client detail, reports, rich text editor, chart, or emoji chunks without an explicit product reason.

Near term:
- Add a bundle analyzer script for before/after comparison.
- Investigate `manualChunks` only after analyzer output identifies stable vendor groups.
- Split always-loaded realtime/provider code only if browser waterfalls show socket/presence cost on non-chat paths.

Long term:
- Review rich text editor loading so comment composition does not pull the full editor until edit/compose intent.
- Review chart imports in reports and project detail for route-level or tab-level chart library loading.
- Add CI bundle budgets once the budgets are accepted by the team.

Do not pursue now:
- Do not silence Vite chunk warnings by only increasing `chunkSizeWarningLimit`.
- Do not aggressively manual-chunk every dependency without measuring real browser waterfall behavior.
- Do not remove route prefetch entirely; the warmed tenant shell and routine work routes are still valuable on normal connections.

## Final Scorecard

- Route splitting: 8/10. Strong route-level lazy loading is already in place.
- Prefetch discipline: 8/10 after remediation. The plan is now budgeted and avoids chat by default.
- Bundle observability: 6/10. Build output is visible, but analyzer/budget tooling is not formalized.
- Heavy dependency isolation: 7/10. Emoji, reports, and chat media are lazy; editor/chart chunks still need focused review.
- Asset hygiene: 7/10. Runtime output is reasonable, but large attached images should remain out of app imports.
- Third-party script control: 8/10. No obvious third-party script tags were found in client runtime source.
- Delivery readiness: 7/10. Safe to release; next gains require analyzer-driven chunk work.
