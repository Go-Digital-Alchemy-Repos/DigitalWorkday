# API Error Envelope Standard

## Standard Error Shape

Every error response from MyWorkDay API follows this envelope:

```json
{
  "ok": false,
  "requestId": "abc-123",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "status": 400,
    "requestId": "abc-123",
    "details": [...]
  },
  "message": "Human-readable description",
  "code": "VALIDATION_ERROR",
  "details": [...]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `ok` | `false` | Always `false` for errors |
| `requestId` | `string` | Correlation ID (from `X-Request-Id` header or auto-generated) |
| `error.code` | `string` | Machine-readable error code (see table below) |
| `error.message` | `string` | Human-readable message safe for display |
| `error.status` | `number` | HTTP status code |
| `error.requestId` | `string` | Same as root `requestId` |
| `error.details` | `any?` | Optional structured details (validation errors, redirect URLs, etc.) |
| `message` | `string` | Legacy field — same as `error.message` |
| `code` | `string` | Legacy field — same as `error.code` |
| `details` | `any?` | Legacy field — same as `error.details` |

### Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body or query params failed Zod validation |
| `TENANT_REQUIRED` | 400 | Operation requires tenant context |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Authenticated but lacks permission |
| `TENANCY_VIOLATION` | 403 | Cross-tenant access attempt detected |
| `NOT_FOUND` | 404 | Resource does not exist (or not visible to caller) |
| `CONFLICT` | 409 | Duplicate or state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `AGREEMENT_REQUIRED` | 451 | Must accept terms before proceeding |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `DUPLICATE_KEY` | 400 | PostgreSQL unique constraint violation |
| `FOREIGN_KEY_VIOLATION` | 400 | Referenced record does not exist |
| `NOT_NULL_VIOLATION` | 400 | Required database field is null |
| `DATABASE_ERROR` | 500 | Unrecognized database error |

## Error Emission Points

All error responses go through one of these standardized paths:

1. **`errorHandler` middleware** (`server/middleware/errorHandler.ts`) — global Express error handler; catches anything passed via `next(err)`.
2. **`sendError()`** (`server/lib/errors.ts`) — direct response helper for route handlers using `return sendError(res, error, req)`.
3. **`handleRouteError()`** (`server/lib/errors.ts`) — catch-all in route try/catch blocks; handles `AppError`, `ZodError`, and unknown errors.
4. **`validateBody()` / `validateQuery()`** (`server/lib/errors.ts`) — inline validation helpers returning `null` on failure.
5. **`validateBody` middleware** (`server/middleware/validate.ts`) — Express middleware throwing `AppError.badRequest` on validation failure.

All five paths produce the identical envelope structure.

## Validation Error Details

For `VALIDATION_ERROR`, `details` is an array of field-level issues:

```json
{
  "details": [
    { "path": "title", "message": "Required" },
    { "path": "priority", "message": "Invalid enum value" }
  ]
}
```

## Request ID Correlation

- Clients can send `X-Request-Id` header; the server echoes it back.
- If absent, the server generates a UUID v4.
- The `requestId` appears in the response body and the `X-Request-Id` response header.
- Server logs include `requestId` for end-to-end tracing.

## Frontend Usage

```typescript
// Standard error handling pattern
const res = await apiRequest("POST", "/api/tasks", body);
if (!res.ok) {
  const data = await res.json();
  // data.error.code → machine-readable
  // data.error.message → display to user  
  // data.error.details → field-level validation errors
}
```

## Test Coverage

`server/tests/error-envelope-consistency.test.ts` — 22 tests verifying:
- Envelope shape consistency across all 5 emission points
- Field-level validation details for ZodError
- requestId correlation (client-provided and auto-generated)
- All major error codes (400, 403, 404, 429, 451, 500)
- AppError.toJSON() serialization
