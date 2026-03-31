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

### Enforcement Mechanism
- **Build-time enforcement**: `npm run build` (used by Railway deployment) runs `npm run check` as a prerequisite. TypeScript errors block deployment.
- **Agent-level enforcement**: The Replit agent code review process validates `npm run check` passes before approving changes.
- **No standalone CI pipeline**: This project does not use GitHub Actions, CircleCI, or similar external CI systems. Enforcement is via the deployment pipeline and agent validation.
- **Developer responsibility**: Run `npm run check` locally before committing. The zero-error baseline must be maintained.

### Future Recommendation
- If a dedicated CI pipeline is introduced (e.g., GitHub Actions), add `npm run check` as a required status check on the main branch.

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
All three resolvers now use `TenantIntegrationService` methods as their single decrypt path:

- **AI Provider**: `integrationService.getIntegrationDetailedSecrets<OpenAISecretConfig>(tenantId, "openai")` — returns integration ID, status, publicConfig, secretConfig, and decrypt status flags. Throws `AIDecryptionError` if encrypted data exists but decryption fails (preserving original error semantics). Returns integration row ID as `sourceId` (preserving telemetry identity).
- **Storage Provider**: `integrationService.getIntegrationDetailedSecrets<S3SecretConfig>(tenantId, "r2")` — checks `status === "configured"` (preserving original status filter), throws `StorageEncryptionNotAvailableError` when encryption unavailable, throws `StorageDecryptionError` on decrypt failure. Returns integration row ID as `integrationId`.
- **QuickBooks Auth**: `qbIntegrationService.getIntegrationWithSecrets(tenantId, "quickbooks")` — returns publicConfig (realmId) + secretConfig (tokens), returns null on any failure.

### New API: `getIntegrationDetailedSecrets()`
Added to `TenantIntegrationService` to support provider resolvers that need both secrets and error discrimination:
```typescript
getIntegrationDetailedSecrets<T>(tenantId, provider) → {
  id: string;               // integration row ID
  status: string;            // integration status
  publicConfig: PublicConfig | null;
  secretConfig: T | null;
  hasEncryptedData: boolean;  // whether configEncrypted column has data
  encryptionAvailable: boolean; // whether APP_ENCRYPTION_KEY is set
} | null
```
This allows callers to distinguish "no integration found" (null) from "integration exists but decrypt failed" (`hasEncryptedData && !secretConfig`) from "encryption not available" (`!encryptionAvailable`).

### Type Changes
- `IntegrationProvider` union type expanded: `"quickbooks"` added to support canonical service path for QuickBooks
- `AIDecryptionError` constructor signature changed from `integrationId: string` to `context: string` (broader applicability)

### Behavior Preservation
- All hierarchical fallback chains (tenant → system → env) remain unchanged
- **AI Provider**: Throws `AIDecryptionError` on decrypt failure (same as before). Returns integration row ID as `sourceId` (same as before). DB schema error fallback preserved.
- **Storage Provider**: Throws `StorageDecryptionError` on decrypt failure (same as before). Throws `StorageEncryptionNotAvailableError` when encryption unavailable (same as before). Status filter (`configured` only) preserved.
- **QuickBooks Auth**: Returns null on any failure (same as before).
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
