# Database Query Performance Audit - 2026-07-21

## Executive Assessment

Overall score after remediation: 8/10.

Release recommendation: Approve with follow-up.

Strongest aspects:
- The repository already has tenant and foreign-key-oriented indexes across the core project/task/client tables.
- High-traffic chat message fetches use bounded limits and batch hydration patterns in several paths.
- Migration smoke tests catch missing journal entries, unsafe operations, and non-idempotent new migrations.

Most important risks:
- Some report endpoints still use expensive aggregate joins and OFFSET pagination; these need production measurement before changing.
- Search uses `%term%` and full-text expressions without a dedicated text-search index strategy.
- A few newer CRM/support list paths had query shapes that outgrew their original single-column indexes.

## System Map

Digital Workday is an Express + TypeScript application with React/TanStack Query on the frontend and PostgreSQL accessed through Drizzle ORM on the backend. Railway deploys the service with `npm run build`, `node server/scripts/deploy-smoke.cjs`, and `npm run start`; migrations run on startup when `AUTO_MIGRATE=true`.

Relevant execution areas inspected:
- `server/storage/notifications.repo.ts`
- `server/storage/support.repo.ts`
- `server/routes/modules/crm/conversations.router.ts`
- `server/storage/chat.repo.ts`
- `server/http/domains/projects.router.ts`
- reporting modules under `server/reports` and `server/http/domains/reports-v2-*`
- `shared/schema.ts`
- migrations and migration smoke tests

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DBQP-01 | High | Confirmed | `server/routes/modules/crm/conversations.router.ts` merge candidates | The route loaded candidate conversations, then ran `Promise.all(filtered.map(...))` with a count query and latest-message query per conversation. | Query count grew as `1 + 2N`, adding latency and connection pressure as clients accumulated conversations. | Replaced per-row queries with one grouped `client_messages` aggregate subquery joined to candidates. | S | Low | Static regression test and TypeScript check. |
| DBQP-02 | Medium | Strongly Supported | `server/storage/notifications.repo.ts`; `shared/schema.ts` | Notification inbox filters by `user_id`, `is_dismissed`, optional `read_at`, cursor `created_at`, and orders by `created_at`; existing indexes were single-column or did not include dismissal/read/order keys together. | Power users can have thousands of notifications; inbox and unread-count queries need an index that matches the filter prefix. | Added `notifications_user_dismissed_created_idx` and `notifications_user_dismissed_read_created_idx`. | S | Low | Migration smoke and static index guard. |
| DBQP-03 | Medium | Strongly Supported | `server/storage/support.repo.ts`; `shared/schema.ts` | Support ticket lists filter by tenant/client/status and order by `last_activity_at`; existing indexes did not include the ordering column. | Ticket inbox pages can scan/sort more rows as support history grows. | Added tenant and tenant-client `last_activity_at` indexes. | S | Low | Migration smoke and static index guard. |
| DBQP-04 | Medium | Strongly Supported | `server/routes/modules/crm/conversations.router.ts`; `shared/schema.ts` | Conversation lists and merge-candidate routes filter by tenant/client and order by `updated_at`; existing indexes covered tenant/client/type and duplicate detection but not updated ordering. Latest-message lookups use `conversation_id` plus `created_at`. | CRM message inboxes and merge-candidate screens are client-facing workflow paths. | Added conversation updated indexes and `client_messages(conversation_id, created_at)`. | S | Low | Migration smoke and static index guard. |
| DBQP-05 | Low | Needs Measurement | Reports modules | Several report queries perform aggregate joins, `COUNT(DISTINCT ...)`, correlated subqueries, and OFFSET pagination. | These are likely acceptable at pilot scale but can become expensive as tenants grow. | No code change in this pass; collect production query plans/pg_stat data first. | M-L | Moderate | Future `EXPLAIN (ANALYZE, BUFFERS)` on representative tenant data. |
| DBQP-06 | Low | Needs Measurement | Search filters across projects, support tickets, CRM conversations | `%term%` `ILIKE` and computed full-text predicates are used in several paths. | B-tree indexes do not help leading-wildcard searches; a text-search plan should be data-driven. | Deferred. Do not add trigram/GIN indexes until search volume and table size justify write amplification. | M | Moderate | Future query stats and UX search latency measurement. |

## Changes Made

- `server/routes/modules/crm/conversations.router.ts`: removed N+1 metadata queries for merge candidates; message count and latest timestamp are now returned through a grouped aggregate join.
- `shared/schema.ts`: added composite indexes for notification inbox, CRM conversation ordering, client message latest-message lookup, and support ticket activity ordering.
- `migrations/0050_query_performance_indexes.sql`: added idempotent SQL for the new indexes.
- `migrations/meta/_journal.json`: registered migration `0050_query_performance_indexes`.
- `server/tests/database-query-performance.test.ts`: added regression checks for index coverage and the batched merge-candidate implementation.

Compatibility considerations:
- No public API response shape changed. `messageCount` and `lastMessage.createdAt` are preserved.
- New indexes are additive and idempotent.
- The migration may take some time on large production tables, but it does not rewrite existing rows.

## Verification

Completed during remediation:
- `npx vitest run server/tests/database-query-performance.test.ts server/tests/migrations-smoke.test.ts` - passed
- `npm run check` - passed

Full test/build/deploy verification is recorded in the commit workflow for this pass.

## Residual Risk and Roadmap

Immediate:
- Watch Railway startup logs for migration duration after deploy.
- Spot-check notification inbox and CRM conversation screens with high-volume users.

Near-term:
- Add a read-only query-plan script that can run `EXPLAIN (ANALYZE, BUFFERS)` safely against representative staging data.
- Replace OFFSET pagination in high-volume reports with cursor pagination where product UX permits.
- Measure notification and support-ticket query latency using pg_stat_statements or application timing.

Long-term:
- Design a full-text search indexing strategy for CRM, projects, tasks, support, and messages.
- Evaluate materialized summary tables for expensive report aggregates only after real tenant data shows repeated slow plans.

Recommendations not pursued:
- No broad caching layer; current evidence points to query shape/index fixes first.
- No blanket GIN/trigram indexes; search usage and write amplification need measurement.
- No report rewrites; those require production-scale query plans to avoid cargo-cult optimization.

## Final Scorecard

- Index/query alignment: 8/10, deducted for remaining report/search measurement needs.
- N+1 protection: 8/10, improved in CRM merge candidates; continued audits should watch new routes.
- Pagination posture: 7/10, most user-facing lists are bounded, but report OFFSET remains.
- Migration safety: 9/10, additive/idempotent migration with journal coverage.
- Operability: 7/10, query-plan tooling is still missing.

Overall: 8/10.
