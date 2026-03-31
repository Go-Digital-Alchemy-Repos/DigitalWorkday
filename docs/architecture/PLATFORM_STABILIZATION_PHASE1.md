# Platform Stabilization — Phase 1

## TypeScript Stabilization Status

### Current State
- `npm run check` passes with **zero errors**
- TypeScript compiler: `tsc --noEmit` (type-check only, no emit)
- All `client/src/**/*`, `shared/**/*`, and `server/**/*` files are covered
- Tests (`*.test.ts`, `*.test.tsx`, `__tests__/**`) are excluded from typecheck scope

### What Was Already Complete
The TypeScript codebase was already clean prior to this sprint. No errors needed fixing.

---

## Typecheck CI/CD Policy

### Policy
- `npm run check` (which runs `tsc`) is the delivery gate for TypeScript correctness
- All changes must pass typecheck before merge
- The `check` script is defined in `package.json` and runs the full TypeScript compiler in `--noEmit` mode

### Enforcement
- Typecheck runs as part of pre-merge validation
- Future sprints should maintain zero-error baseline

---

## Compiler Target / Runtime Compatibility

### Configuration
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["esnext", "dom", "dom.iterable"],
    "jsx": "preserve",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "incremental": true
  }
}
```

### Rationale
- **ES2022 target**: Matches Node.js 18+ runtime capabilities (top-level await, class fields, `at()`, `Object.hasOwn()`, error cause). Safe for the Replit/Railway deployment environment.
- **ESNext module**: Compatible with Vite's bundler-based module resolution on the frontend and tsx/ts-node on the backend.
- **bundler moduleResolution**: Aligns with Vite's import resolution semantics.
- **strict: true**: Full strict mode enabled (strictNullChecks, noImplicitAny, etc.)
- **incremental: true**: Speeds up repeated typechecks during development.

### Compatibility Notes
- No downlevel iteration issues at ES2022
- All modern JS features used in the codebase (optional chaining, nullish coalescing, class fields) are natively supported
- `skipLibCheck: true` avoids false positives from third-party `.d.ts` files

---

## Tenant Integration Secret Handling

### Before (Inline Decrypt Pattern)
Three specialized provider resolvers manually duplicated the decrypt logic from `TenantIntegrationService`:

1. **`server/services/ai/getAIProvider.ts`**: Direct DB query + `JSON.parse(decryptValue(integration.configEncrypted))`
2. **`server/storage/getStorageProvider.ts`**: Direct DB query with status filter + `JSON.parse(decryptValue(integration.configEncrypted))`
3. **`server/integrations/quickbooks/quickbooksAuth.ts`**: Direct DB query + `JSON.parse(decryptValue(integration.configEncrypted))`

Each file independently imported `db`, `tenantIntegrations`, `decryptValue`, and `isEncryptionAvailable`, creating parallel decrypt paths with inconsistent error handling.

### After (Canonical Service)
All three resolvers now use `TenantIntegrationService.getIntegrationWithSecrets()` as their single decrypt path:

- **AI Provider**: `integrationService.getIntegrationWithSecrets(tenantId, "openai")` — returns both publicConfig (for enabled/model checks) and secretConfig (for API key)
- **Storage Provider**: `integrationService.getIntegrationWithSecrets(tenantId, "r2")` — returns publicConfig + secretConfig, validated by existing `isValidS3Config()` 
- **QuickBooks Auth**: `qbIntegrationService.getIntegrationWithSecrets(tenantId, "quickbooks")` — returns publicConfig (realmId) + secretConfig (tokens)

### Type Changes
- `IntegrationProvider` union type expanded: `"quickbooks"` added to support canonical service path for QuickBooks
- `AIDecryptionError` constructor signature changed from `integrationId: string` to `context: string` (broader applicability)

### Behavior Preservation
- All hierarchical fallback chains (tenant → system → env) remain unchanged
- Error handling semantics preserved: AI throws on DB schema issues, storage validates config completeness, QuickBooks returns null on any failure
- The canonical `_decryptSecretConfig` returns null on corrupt data (same as previous catch blocks)
- All existing callers continue to work identically

### Test Coverage
- 21 existing tests in `server/tests/tenant-integrations.test.ts` cover:
  - Encrypted storage round-trip
  - Decrypted read path (`getDecryptedSecrets`, `getIntegrationWithSecrets`)
  - Missing/partial secret cases
  - Corrupt encrypted data (returns null without throwing)
  - Tenant isolation
  - Secret preservation across updates

### Backward Compatibility
- No API response shape changes
- No route contract changes  
- No auth behavior changes
- No tenant scoping changes

### Follow-up Recommendations
- The `storeTokens` function in `quickbooksAuth.ts` still uses direct `encryptValue` + DB operations. A future consolidation could route writes through `TenantIntegrationService.upsertIntegration()` as well.
- The `disconnectQuickBooks` and `getConnectionStatus` functions still query the DB directly. These could be consolidated in a future pass.
