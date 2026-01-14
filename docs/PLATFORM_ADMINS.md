# Platform Admins Management

## Overview

Platform Admins (super_users) have full access to the MyWorkDay platform. This document describes the management system for creating, configuring, and onboarding platform administrators.

## Features

### Admin Lifecycle

1. **Creation**: Super admins can create new platform admin accounts with email, first name, and last name
2. **Invite Generation**: Generate secure invite links for admins to set their password
3. **Activation**: Admins use the invite link to set their password and activate their account
4. **Management**: Edit details, deactivate, or reactivate admin accounts

### Invite System

Platform admins are onboarded through a secure invite link system:

1. **Token Generation**: A cryptographically secure 32-byte token is generated
2. **Token Hashing**: Only the SHA-256 hash is stored in the database (never the raw token)
3. **Link Format**: `https://your-app.com/auth/platform-invite?token=<64-char-hex>`
4. **Expiration**: Links expire after 7 days by default (configurable 1-30 days)
5. **Single Use**: Tokens are invalidated after use
6. **Revocation**: Previous unused invites are automatically revoked when a new invite is generated

### Guardrails

- **Last Admin Protection**: Cannot deactivate the last active super admin
- **Email Uniqueness**: Validates that email addresses are unique across all users
- **Password Requirements**: Minimum 8 characters for passwords

## API Endpoints

### List Platform Admins
```
GET /api/v1/super/admins
```
Returns all super_user accounts with their status information.

### Get Platform Admin Details
```
GET /api/v1/super/admins/:id
```
Returns detailed information including recent audit events.

### Create Platform Admin
```
POST /api/v1/super/admins
Body: { email, firstName, lastName }
```
Creates a new admin account (requires invite to set password).

### Update Platform Admin
```
PATCH /api/v1/super/admins/:id
Body: { email?, firstName?, lastName?, isActive? }
```
Updates admin details or activates/deactivates the account.

### Generate Invite Link
```
POST /api/v1/super/admins/:id/invite
Body: { expiresInDays?: number, sendEmail?: boolean }
```
Generates a new invite link. Optionally sends email if Mailgun is configured.

### Verify Invite Token (Public)
```
GET /api/v1/auth/platform-invite/verify?token=<token>
```
Verifies the invite token and returns the target user's email.

### Accept Invite (Public)
```
POST /api/v1/auth/platform-invite/accept
Body: { token, password }
```
Sets the password, activates the account, and logs the user in.

## Audit Events

All platform admin actions are logged:

| Event Type | Description |
|------------|-------------|
| `platform_admin_created` | New admin account created |
| `platform_admin_updated` | Admin details modified |
| `platform_admin_deactivated` | Admin account deactivated |
| `platform_admin_reactivated` | Admin account reactivated |
| `platform_admin_invite_generated` | New invite link generated |
| `platform_admin_invite_emailed` | Invite sent via email |
| `platform_admin_invite_accepted` | Admin set password and activated |

## Database Schema

### platform_invitations
- `id`: Primary key (UUID)
- `email`: Target email address
- `token_hash`: SHA-256 hash of the invite token
- `status`: pending | accepted | expired | revoked
- `expires_at`: Expiration timestamp
- `used_at`: When the invite was accepted
- `revoked_at`: When the invite was revoked
- `target_user_id`: Reference to the user account
- `created_by_user_id`: Who generated the invite
- `created_at`: Creation timestamp

### platform_audit_events
- `id`: Primary key (UUID)
- `actor_user_id`: Who performed the action
- `target_user_id`: Who the action was performed on
- `event_type`: Type of event
- `message`: Human-readable description
- `metadata`: JSON with additional details
- `created_at`: Event timestamp

## UI Components

### Platform Admins Tab (System Settings)
Located at `/super-admin/settings` under the "Platform Admins" tab:
- List of all platform admins with status badges
- "New Platform Admin" button opens a drawer form
- Each admin row has action menu with: Edit, Generate Invite Link, Send Email, Deactivate/Reactivate

### Invite Acceptance Page
Located at `/auth/platform-invite`:
- Public page (no authentication required)
- Verifies invite token on load
- Shows error states for invalid/expired/used tokens
- Password form with confirmation
- Automatically logs in user after activation

## Security Considerations

1. **Token Security**: Raw tokens are never stored, only SHA-256 hashes
2. **Timing-Safe Comparison**: Token verification uses timing-safe comparison
3. **Rate Limiting**: Consider adding rate limiting to prevent brute force attacks
4. **Audit Trail**: All actions are logged for accountability
5. **Password Hashing**: Uses scrypt with 64-byte output and random salt
6. **Session Management**: Sessions stored in PostgreSQL for multi-replica support

## Configuration

### Environment Variables
- `MAILGUN_API_KEY`: Required for email invites
- `MAILGUN_DOMAIN`: Required for email invites
- `MAILGUN_FROM_EMAIL`: Optional sender email address

### Defaults
- Invite expiration: 7 days
- Password minimum length: 8 characters

## Testing

Run the platform admin tests:
```bash
npm test -- server/tests/platform-admins.test.ts
```

## Manual Testing Checklist

### Local Development
1. [ ] Navigate to Super Admin > System Settings > Platform Admins
2. [ ] Click "New Platform Admin" and create an account
3. [ ] Generate an invite link for the new admin
4. [ ] Copy the invite link and open in incognito window
5. [ ] Set password and verify account activation
6. [ ] Log in with the new admin credentials
7. [ ] Verify audit events are logged

### Production (Railway)
1. [ ] Verify HTTPS is working for secure cookies
2. [ ] Test invite link with production URL
3. [ ] Verify Mailgun email delivery (if configured)
4. [ ] Test last-admin protection by attempting to deactivate
