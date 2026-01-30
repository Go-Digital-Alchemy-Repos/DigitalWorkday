# Super Admin Guide

**Status:** Current  
**Last Updated:** January 2026

This guide covers the Super Admin features for platform-wide management of MyWorkDay.

---

## Overview

Super Admins have platform-level access to manage all tenants, users, and system configuration. The Super Admin interface is accessible from the top navigation after logging in with a super_user account.

---

## Super Admin Navigation

Access the Super Admin area from the left sidebar:

| Menu Item | Description |
|-----------|-------------|
| Dashboard | Platform overview with tenant stats |
| Tenants | Manage all tenants on the platform |
| Users | Platform-wide user management |
| Reports | Cross-tenant analytics and reports |
| Settings | System configuration and integrations |
| Status | System health and diagnostics |
| Chat Monitor | Monitor chat activity across tenants |
| App Docs | Browse application documentation |

---

## Tenant Management

### Viewing Tenants

Navigate to **Tenants** to see all tenants:
- Tenant name and status
- User count
- Creation date
- Subscription status (if applicable)

### Creating a New Tenant

1. Click **Create Tenant** button
2. Fill in tenant details:
   - Company name
   - Subdomain (optional)
   - Admin email
3. Configure initial settings
4. Click **Create**

### Tenant Detail View

Click any tenant to open the detail drawer with tabs:

| Tab | Contents |
|-----|----------|
| Overview | Basic info, stats, creation date |
| Users | All users within the tenant |
| Health | Data integrity diagnostics |
| Integrations | Tenant-specific integrations |
| Settings | Tenant configuration |

### Impersonation (Act-As-Tenant)

Super Admins can view the application as any tenant:

1. Open tenant detail drawer
2. Click **Impersonate** button
3. A banner appears showing impersonation status
4. Navigate the app as if logged in as that tenant's admin
5. Click **Stop Impersonation** to return

**Important:** Impersonation is logged and audited.

---

## User Management

### Platform-Wide User View

Navigate to **Users** to see all users across all tenants:
- Filter by tenant, role, status
- Search by name or email
- View last login date

### User Actions

For any user, Super Admins can:
- View profile details
- Reset password
- Deactivate/reactivate account
- Change role
- Delete user (with confirmation)

### Bulk Operations

- Export user list to CSV
- Import users via CSV
- Bulk status changes

---

## System Status

Navigate to **Status** for system health:

### Components Monitored

| Component | Checks |
|-----------|--------|
| Database | Connection, query time, schema status |
| Storage (S3/R2) | Bucket access, upload capability |
| Email (Mailgun) | API connectivity, send quota |
| WebSocket | Socket.IO connections, room count |

### Health Diagnostics

Run diagnostics to check:
- Orphaned data (entities without tenant_id)
- Missing references
- Schema inconsistencies
- Performance bottlenecks

### Repair Tools

Available repair operations:
- Backfill missing tenant IDs
- Quarantine manager for invalid data
- Integrity check and repair

---

## Reports

### Available Reports

| Report | Description |
|--------|-------------|
| Tenant Activity | Login frequency, feature usage |
| User Growth | New registrations over time |
| Storage Usage | Per-tenant storage consumption |
| API Usage | Request counts, error rates |

### Exporting Data

Reports can be exported in:
- CSV format
- JSON format
- PDF (select reports)

---

## Settings

### System Configuration

Configure platform-wide settings:
- Default tenant settings
- Feature flags
- Rate limiting thresholds
- Session timeout

### Integrations

Manage system-level integrations:
- S3/R2 storage configuration
- Mailgun email settings
- OAuth providers (Google)
- Stripe (if enabled)

### Storage Configuration

Hierarchical storage resolution:
1. Tenant-specific R2/S3 (if configured)
2. System-level R2/S3
3. Environment variable fallback

---

## App Docs

Navigate to **App Docs** for comprehensive documentation:

### Browsing Documentation

- Categorized sidebar navigation
- Full-text search
- Markdown rendering with code highlighting

### Categories

Documentation is organized into:
- Getting Started
- Architecture
- Features
- API Reference
- Security
- Deployment
- And more...

---

## Chat Monitoring

Navigate to **Chat Monitor** to oversee chat activity:

- View active channels per tenant
- Monitor message volume
- Review flagged content (if configured)
- Audit chat exports

---

## Security Considerations

### Audit Logging

All Super Admin actions are logged:
- Tenant creation/modification
- User changes
- Impersonation sessions
- Configuration changes

### Access Control

- Only super_user role can access Super Admin features
- Impersonation is time-limited
- Sensitive operations require confirmation

### Best Practices

1. **Use impersonation sparingly** - Only when necessary for support
2. **Review audit logs** - Regular review of admin actions
3. **Protect credentials** - Super Admin accounts should use strong passwords and 2FA
4. **Document changes** - Note significant configuration changes

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Can't see tenants | Check super_user role assignment |
| Impersonation fails | Verify tenant is active |
| Health check errors | Check database connectivity |
| Storage errors | Verify S3/R2 credentials |

### Getting Help

For platform issues:
1. Check the App Docs for relevant documentation
2. Review system logs
3. Contact the development team

---

## Related Documentation

- [Tenant Admin Guide](./TENANT_ADMIN_GUIDE.md) - Tenant-level administration
- [Tenancy Remediation](./TENANCY_REMEDIATION.md) - Data health tools
- [Multi-Tenancy Security](../07-SECURITY/MULTI_TENANCY.md) - Security model
- [System Overview](../architecture/SYSTEM_OVERVIEW.md) - Architecture
