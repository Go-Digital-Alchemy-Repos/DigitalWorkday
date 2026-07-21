# WCAG 2.2 AA Accessibility Audit

Date: 2026-07-21
Scope: React client, shared UI primitives, tenant/admin/client portal navigation, support workflows, documents, notes, asset library, forms, dialogs, tables, drag-and-drop, notifications, and accessibility documentation.

## 1. Executive Assessment

Overall score: 6.5/10 after this pass.

Release recommendation: Approve with follow-up. The changes in this pass are low-risk and improve assistive technology behavior, but the repository is not yet ready to claim full WCAG 2.2 AA conformance.

Strongest aspects:
- Radix-backed primitives are used for dialogs, sheets, alert dialogs, dropdowns, select, switch, tabs, tooltips, and toast infrastructure, giving focus trapping and keyboard support a solid base.
- Skip navigation already exists in tenant, super-admin, and portal layouts through `client/src/components/skip-link.tsx` and `main#main-content`.
- Form-heavy areas often use shadcn/react-hook-form patterns with `FormField`, `FormLabel`, `FormMessage`, and explicit `htmlFor` labels.

Most important risks:
- A static JSX scan still found 172 icon-sized `Button` instances without `aria-label`, `aria-labelledby`, or `title`.
- Drag-and-drop surfaces depend on dnd-kit and FullCalendar keyboard behavior that should be verified with browser/screen-reader testing, not only static review.
- No automated axe/Playwright accessibility gate is installed, so regressions are currently caught only through review or targeted tests.

## 2. System Map

Application type: multi-tenant project management and client portal web app.

Runtime and build:
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/Radix UI, Wouter.
- Backend: Express, TypeScript, Passport sessions, Socket.IO.
- Persistence: PostgreSQL with Drizzle ORM.
- State: TanStack Query for server state, local React state and focused custom hooks for UI state.
- Deployment: Railway using `railway.toml`, Railpack build command `npm run build`, production start command `node server/scripts/deploy-smoke.cjs && npm run start`.
- Test stack: Vitest plus TypeScript checking and production build.

Major UI boundaries inspected:
- Shared primitives: `client/src/components/ui`, `client/src/components/ui-system`, `client/src/components/layout`.
- Layout/routing: `client/src/routing/tenantRouter.tsx`, `client/src/routing/superRouter.tsx`, `client/src/routing/portalRouter.tsx`.
- Client portal: `client/src/pages/client-portal-*`, `client/src/components/client-portal-users-tab.tsx`.
- Tenant support/documents/notes: support pages, `client-documents-*`, `client-notes-tab.tsx`, `project-notes-tab.tsx`.
- Rich interaction surfaces: chat, tasks, project board, CRM pipeline, asset library, calendar.

Files not changed casually:
- Lockfiles, migrations, generated build outputs, and database schema were not modified.
- Broad chat/task DnD surfaces were inspected and left for a focused follow-up because they are interaction-dense and need runtime keyboard validation.

## 3. Findings Table

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A11Y-01 | High | Confirmed | Systemic | `client/src/**/*.{tsx,ts}` | Static JSX scan found 188 unnamed icon `Button`s before remediation and 172 after this pass. Samples include `client/src/pages/chat.tsx:2949`, `client/src/pages/client-detail.tsx:1084`, `client/src/pages/notifications-inbox.tsx:484`, `client/src/features/tasks/task-detail-drawer.tsx:1063`, `client/src/components/notification-center.tsx:827`. | WCAG 1.1.1 and 4.1.2 require controls to expose a meaningful name. Icon-only buttons without labels are announced as unlabeled controls. | This pass fixed low-risk support, portal, documents, notes, asset, toolbar, sidebar, and admin examples. Continue module-by-module, prioritizing auth, notifications, chat, task drawers, and mobile nav. | M | Moderate | Static JSX scan plus screen-reader spot checks. |
| A11Y-02 | Medium | Confirmed | Cross-cutting | `client/src/components/layout/loading-state.tsx`, `client/src/components/ui/skeleton.tsx` | Loading state previously rendered only visual skeletons; skeleton divs were not hidden from assistive tech. | WCAG 4.1.3 status messages and 1.3.1 relationships: assistive tech users need a status announcement, not decorative placeholder nodes. | Added `role="status"`, `aria-live="polite"`, `aria-label="Loading content"` to `LoadingState`; added `aria-hidden="true"` to `Skeleton`. | XS | Low | `design_system_ssr_primitives.test.tsx` asserts status and hidden defaults. |
| A11Y-03 | Medium | Confirmed | Cross-cutting | `client/src/components/layout/error-state.tsx` | Shared error state previously displayed visual error content without alert semantics. | WCAG 4.1.3: screen readers need error/status changes announced when asynchronous page content fails. | Added `role="alert"`, `aria-live="assertive"`, and hid the decorative icon. | XS | Low | Typecheck and SSR primitive coverage. |
| A11Y-04 | Medium | Confirmed | Cross-cutting | `client/src/components/ui/toast.tsx` | `ToastClose` rendered an icon close control without a default accessible name. | WCAG 4.1.2: dismiss buttons need an accessible name. | Added default `aria-label="Close notification"` while preserving caller override. | XS | Low | SSR test asserts the default label. |
| A11Y-05 | Medium | Strongly Supported | Feature-wide | `client/src/pages/project.tsx`, `client/src/pages/my-tasks.tsx`, `client/src/pages/crm-pipeline.tsx`, `client/src/features/assetLibrary/AssetLibraryPanel.tsx` | dnd-kit is used via `DndContext`, `DragOverlay`, `useSortable`, and keyboard sensors in some areas. | WCAG 2.1.1 and 2.5.7: drag workflows need keyboard alternatives and clear instructions/announcements. | Do a focused DnD runtime pass with keyboard-only testing and screen-reader announcements. Avoid sweeping edits until actual failures are measured. | M | Moderate | Playwright keyboard scenarios and manual screen-reader verification. |
| A11Y-06 | Medium | Needs Measurement | Feature-wide | `client/src/pages/calendar.tsx`, `client/src/pages/my-calendar.tsx`, `client/src/features/projects/project-calendar.tsx` | FullCalendar renders core calendar UI; local wrapper has some named prev/next controls after this pass. | WCAG 2.1.1, 2.4.3, 1.3.1: calendars need predictable focus order and event semantics. | Add browser-level checks for event focus, date navigation, and visible focus at 200 percent zoom. | M | Moderate | Playwright plus manual keyboard test. |
| A11Y-07 | Low | Confirmed | Tooling | `package.json` | `npm ls axe-core @axe-core/playwright --depth=0` returned empty. | Without an automated accessibility smoke gate, regressions are likely in a large UI. | Add `@axe-core/playwright` or equivalent after agreeing on browser test scope. | S | Low | CI job that runs authenticated smoke pages where fixtures are available. |

## 4. Changes Made

Shared primitives:
- `client/src/components/layout/loading-state.tsx`: added polite loading status semantics.
- `client/src/components/layout/error-state.tsx`: added alert semantics for async/page errors.
- `client/src/components/ui/skeleton.tsx`: hid decorative skeleton blocks from assistive tech.
- `client/src/components/ui/toast.tsx`: added a default accessible name for toast close controls.
- `client/src/components/layout/data-toolbar.tsx` and `client/src/components/ui-system/DataToolbar.tsx`: named clear-search, list/grid view, and remove-filter icon controls.

Feature controls:
- Added contextual accessible names to icon buttons in support templates, SLA policies, support schema pages, portal support pages, client detail invite/copy/edit controls, client portal users, documents, notes, asset library menus, forecast snapshot export, attachment preview close, team/workspace menus, tenant/app sidebars, and super-admin tenant drawer controls.

Tests:
- `client/src/__tests__/design_system_ssr_primitives.test.tsx`: added assertions for status, hidden skeleton, and toast close accessible-name defaults.

Compatibility:
- No API routes, database schema, auth flows, tenancy behavior, or Railway configuration changed.
- UI behavior is intended to remain the same; changes add semantic attributes only.

## 5. Verification Results

Passed:
- `git diff --check`
- `npm run check`
- `npx vitest run client/src/__tests__/design_system_ssr_primitives.test.tsx`

Important output:
- Targeted Vitest: 1 file passed, 3 tests passed.
- TypeScript: passed with no errors after correcting labels to existing fields.
- Static scan after remediation: 172 remaining icon-sized `Button`s without explicit accessible names.

Could not run:
- Automated axe browser audit: no `axe-core` or `@axe-core/playwright` dependency is installed.
- Manual screen-reader pass: not available from this terminal-only execution path.

## 6. Residual Risk And Roadmap

Immediate:
- Finish accessible names for the remaining icon buttons, prioritized by auth/password flows, notification center, chat, task drawers, mobile nav, and client-detail controls.
- Add a lightweight static regression test or ESLint rule for `Button size="icon"` requiring `aria-label`, `aria-labelledby`, or a reviewed equivalent.

Near-term:
- Add Playwright plus axe checks for login, tenant dashboard, client portal dashboard, support ticket flow, task detail drawer, chat thread, notification center, and settings forms.
- Run keyboard-only QA for `DndContext` surfaces in project board, My Tasks, CRM pipeline, and asset library.
- Validate FullCalendar focus order and event naming in tenant calendar, My Calendar, and project calendar.

Long-term:
- Build an accessibility checklist into the component documentation and design-system examples.
- Add theme contrast validation for all 14 theme packs whenever colors change.
- Add reduced-motion acceptance checks around Framer Motion and route/page animation patterns.

Do not pursue yet:
- Do not replace Radix primitives; the existing primitive choice is sound.
- Do not rewrite drag-and-drop workflows before measuring actual keyboard/screen-reader failures.
- Do not mass-edit all pages blindly; dense chat/task pages need focused runtime validation.

## 7. Final Scorecard

Semantics: 6/10. Radix and forms are strong, but remaining unnamed icon controls are a systemic deduction.

Keyboard access: 6/10. Core primitives and some dnd-kit keyboard support exist, but chat/task/calendar need runtime verification.

Focus management: 7/10. Dialog/sheet/dropdown focus behavior is mostly delegated to Radix; large custom panels still need spot checks.

Forms and errors: 7/10. Form labels are generally present; shared error status semantics improved in this pass.

Status announcements: 6/10. Loading/error/toast primitives improved; realtime notification announcements still need deeper review.

Contrast and theming: 7/10. Semantic tokens and theme packs are documented; automated contrast validation is still absent.

Motion and cognitive load: 6/10. Motion primitives exist, but reduced-motion behavior should be verified across routed pages and drawers.

Testing and governance: 5/10. Targeted tests now cover shared defaults, but there is no axe/browser accessibility gate yet.
