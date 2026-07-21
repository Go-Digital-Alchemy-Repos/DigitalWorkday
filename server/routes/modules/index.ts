/**
 * Legacy route-module barrel.
 *
 * Active API routes are registered through `server/http/mount.ts` and the
 * domain routers under `server/http/domains/`. Keep this file as a migration
 * marker for older docs/scripts that point at `server/routes/modules`, but do
 * not add new exports here.
 */
export * from "./search/search.router";
