# DEPRECATED — Legacy Routes Folder

This folder contains route files that have been migrated to the registry-based routing model.

All routes are now:
1. Created using `createApiRouter()` from `server/http/routerFactory.ts`
2. Registered and mounted via `server/http/mount.ts`
3. Tracked in the route registry (`server/http/routeRegistry.ts`)

## Do NOT add new routes here

New routes should be created in `server/http/domains/` using `createApiRouter`.
See `docs/architecture/routes.md` for the complete guide.

## Files in this folder

These files are imported by `server/http/mount.ts` and continue to function,
but new development should follow the `server/http/domains/` pattern.

The route files here use `createApiRouter` internally but remain in this folder
for organizational stability. They may be moved to `server/http/domains/` in
future cleanup passes.
