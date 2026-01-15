# Email Observability System

This document describes the email outbox logging and resend functionality in MyWorkDay.

## Overview

The email observability system provides:
- **Outbox Logging**: All outgoing emails are tracked in the `email_outbox` table with status, timestamps, and error details
- **Status Tracking**: Emails are marked as `queued`, `sent`, or `failed`
- **Resend Capability**: Failed invitation and password reset emails can be resent (up to 3 times)
- **Multi-tenant Support**: Emails are scoped to tenants; Super Admins can view all emails across tenants

## Database Schema

### email_outbox Table

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR (UUID) | Primary key |
| tenantId | VARCHAR | Foreign key to tenants (nullable for system emails) |
| messageType | TEXT | Type of email (invitation, forgot_password, etc.) |
| toEmail | TEXT | Recipient email address |
| subject | TEXT | Email subject line |
| status | TEXT | queued, sent, or failed |
| providerMessageId | TEXT | ID from email provider (e.g., Mailgun) |
| lastError | TEXT | Error message if failed |
| requestId | TEXT | Correlation ID for debugging |
| resendCount | INTEGER | Number of resend attempts |
| lastResendAt | TIMESTAMP | When last resend was attempted |
| metadata | JSONB | Additional context (original body for resends) |
| createdAt | TIMESTAMP | When email was queued |
| updatedAt | TIMESTAMP | Last status update |

### Indexes

- `email_outbox_tenant_idx` - Filter by tenant
- `email_outbox_status_idx` - Filter by status
- `email_outbox_type_idx` - Filter by message type
- `email_outbox_created_idx` - Order by creation time

## Message Types

| Type | Description | Resendable |
|------|-------------|------------|
| invitation | User/tenant invitation emails | Yes |
| forgot_password | Password reset emails | Yes |
| mention_notification | @mention notifications | No |
| test_email | Mailgun integration test | No |
| other | Miscellaneous emails | No |

## API Endpoints

### Tenant Admin Endpoints

**GET /api/v1/tenant/email-logs**
- Lists email logs for the current tenant
- Query params: `status`, `messageType`, `fromDate`, `toDate`, `limit`, `offset`
- Requires: Tenant Admin role

**GET /api/v1/tenant/email-logs/stats**
- Returns email statistics for the current tenant
- Requires: Tenant Admin role

**POST /api/v1/tenant/email-logs/:emailId/resend**
- Resends a failed email
- Guards: Only resendable types, max 3 retries, must belong to tenant
- Requires: Tenant Admin role

### Super Admin Endpoints

**GET /api/v1/super/email-logs**
- Lists email logs across all tenants
- Additional query param: `tenantId` (optional filter)
- Requires: Super User role

**GET /api/v1/super/email-logs/stats**
- Returns email statistics (optionally filtered by tenant)
- Query param: `tenantId` (optional)
- Requires: Super User role

**POST /api/v1/super/email-logs/:emailId/resend**
- Resends a failed email (any tenant)
- Guards: Only resendable types, max 3 retries
- Requires: Super User role

## Resend Safety Rules

1. **Only certain message types can be resent**: `invitation` and `forgot_password`
2. **Maximum 3 resend attempts**: Prevents infinite retry loops
3. **Only failed emails can be resent**: Sent/queued emails cannot be resent
4. **Tenant isolation**: Tenant admins can only resend emails belonging to their tenant
5. **Recipient validation**: Original recipient email is preserved (no modification)

## UI Locations

### Tenant Admin: Settings > Email Logs
- View email history for tenant
- Filter by status and message type
- Resend failed emails (with button disabled after max retries)
- Stats cards showing total/sent/failed/recent counts

### Super Admin: System Status > Email Logs
- Cross-tenant email visibility
- Filter by tenant ID in addition to status/type
- Resend any tenant's failed emails

## Integration with Email Service

The `EmailOutboxService` (`server/services/emailOutbox.ts`) wraps all email sending:

```typescript
const result = await emailOutboxService.sendEmail({
  tenantId: "tenant-uuid",
  messageType: "invitation",
  toEmail: "user@example.com",
  subject: "You're invited!",
  textBody: "Click here to join...",
  requestId: "req_abc123",
  metadata: { inviteId: "..." }
});
```

The service:
1. Creates an outbox record with `queued` status
2. Fetches tenant's Mailgun configuration
3. Sends via Mailgun API
4. Updates status to `sent` or `failed`

## Debugging

Enable debug logging:
```bash
EMAIL_DEBUG=true
# or
MAILGUN_DEBUG=true
```

Check logs for `[EmailOutbox]` prefix entries with details about:
- Email queue events
- Send success/failure
- Provider message IDs
- Error messages

## Future Considerations

- Webhook integration for delivery/bounce tracking
- Scheduled retry for failed emails
- Email templates management
- Click/open tracking
