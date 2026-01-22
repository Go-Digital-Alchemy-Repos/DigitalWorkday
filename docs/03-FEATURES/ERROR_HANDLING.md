# Error Handling & Logging

**Status:** Current  
**Last Updated:** January 2026

Centralized error handling with request correlation and structured logging.

## Error Response Format

All API errors return a consistent envelope:

```json
{
  "error": "User-friendly error message",
  "code": "ERROR_CODE",
  "requestId": "abc12345",
  "details": {}
}
```

## Standard Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized for this action |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Request ID Correlation

Every request receives a unique `X-Request-Id` header:

1. Client receives error with `requestId`
2. Error toast shows reference: "Something went wrong (Ref: abc12345)"
3. Super admin can search error logs by request ID
4. Server logs include request ID for correlation

## Error Logging

All 500+ errors and key 4xx errors (403, 404, 429) are captured to the `error_logs` table:

| Field | Description |
|-------|-------------|
| requestId | Correlation ID |
| method | HTTP method |
| path | Request path |
| statusCode | Response status |
| errorCode | Standard error code |
| errorMessage | Error message |
| stack | Stack trace (500 only) |
| userId | Authenticated user (if any) |
| tenantId | Tenant context (if any) |
| metadata | Additional context |

### Security

- Secrets are automatically redacted from logs
- Stack traces only stored for 500 errors
- Sensitive headers filtered

## Super Admin Error Viewer

Access error logs at `/super-admin/status` (System Health tab):

- Filter by time range, status code, error code
- Search by request ID
- View full stack traces
- Export for analysis

## Implementation

### AppError Class

```typescript
import { AppError } from './lib/errors';

throw new AppError('Resource not found', 'NOT_FOUND', 404);
throw new AppError('Invalid email', 'VALIDATION_ERROR', 400, { field: 'email' });
```

### Error Handler Middleware

Located in `server/middleware/errorHandler.ts`:

- Catches all errors
- Formats standard response
- Logs to database
- Adds request ID header

## Related Documentation

- [ERROR_HANDLING.md](../ERROR_HANDLING.md) - Technical implementation
- [ERROR_LOGGING.md](../ERROR_LOGGING.md) - Logging details
