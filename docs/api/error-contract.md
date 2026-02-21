# API Error Contract

## Overview

All API endpoints return responses in a standardized envelope format. This document specifies the contract for error and success responses.

## Response Envelopes

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "requestId": "uuid"
}
```

Legacy endpoints may also return:
```json
{
  "ok": true,
  "data": { ... },
  "requestId": "uuid"
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": [...]
  },
  "requestId": "uuid"
}
```

Legacy endpoints may also include top-level `message`, `code`, and `ok: false` fields for backward compatibility.

## Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| `VALIDATION_ERROR` | 400 | Request data failed validation |
| `UNAUTHORIZED` | 401 | Authentication required or invalid |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Resource state conflict |
| `TENANT_REQUIRED` | 400 | Tenant context missing |
| `TENANCY_VIOLATION` | 403 | Cross-tenant access attempt |
| `AGREEMENT_REQUIRED` | 451 | Agreement acceptance needed |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Validation Errors

Validation failures include field-level details:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "path": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      },
      {
        "path": "name",
        "message": "Required",
        "code": "invalid_type"
      }
    ]
  },
  "requestId": "abc-123"
}
```

## Validation Middleware

New routes should use the `validateBody` middleware for automatic request validation:

```ts
import { validateBody } from "../http/middleware/validateBody";
import { insertTaskSchema } from "@shared/schema";

router.post("/tasks", validateBody(insertTaskSchema), (req, res) => {
  // req.body is validated and typed
});
```

Available middleware:
- `validateBody(schema)` — Validates `req.body`
- `validateQuery(schema)` — Validates `req.query`
- `validateParams(schema)` — Validates `req.params`

## Response Helpers

Routes using `createApiRouter` from `routerFactory` have access to:

```ts
// Standard envelope helpers (existing)
res.ok(data, statusCode?)      // { ok: true, data, requestId }
res.fail(code, message, status?, details?)  // { ok: false, error: {...}, requestId }

// New v2 helpers
res.sendSuccess(data, statusCode?)   // { success: true, data, requestId }
res.sendError(appError)              // { success: false, error: {...}, requestId }
```

## Request ID

Every API response includes a `requestId` field (from the `X-Request-Id` header). Use this for:
- Correlating client errors with server logs
- Support ticket references
- Debugging specific request failures

## Migration Guide

**For new endpoints:** Use `validateBody` middleware + `res.sendSuccess()`/`res.sendError()`.

**For existing endpoints:** No changes required. Legacy `handleRouteError()` and `sendError()` functions continue to produce compatible responses with both `ok` and `success` fields.
