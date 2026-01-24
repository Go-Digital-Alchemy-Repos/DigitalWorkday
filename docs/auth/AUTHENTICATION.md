# Authentication Guide

This document describes the authentication system used in MyWorkDay, including cookie-based sessions, diagnostics, and common deployment issues.

## Overview

MyWorkDay uses cookie-based session authentication with PostgreSQL session storage:

- **Session Management**: Express-session with connect-pg-simple (PostgreSQL)
- **Authentication**: Passport.js with Local Strategy
- **Cookies**: httpOnly, secure (production), SameSite=Lax
- **Session Duration**: 30 days

## Cookie-Based Auth Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser       │    │   Express       │    │   PostgreSQL    │
│   (Cookie)      │◄──►│   (Session)     │◄──►│   (Storage)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### How It Works

1. User submits credentials to `/api/v1/auth/login`
2. Server validates credentials using Passport.js
3. Session created and stored in PostgreSQL (`user_sessions` table)
4. Cookie (`connect.sid`) sent to browser
5. Subsequent requests include cookie for authentication
6. Server looks up session in PostgreSQL

### Cookie Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| httpOnly | true | true |
| secure | false | true |
| sameSite | lax | lax |
| maxAge | 30 days | 30 days |

## Auth Diagnostics

Super Admins can access the Auth Diagnostics panel to verify cookie-based auth is correctly configured.

### Accessing Diagnostics

1. Log in as Super Admin
2. Navigate to **Super Admin → System Status**
3. Click the **Auth Diagnostics** tab

### Interpreting Health Status

The diagnostics panel shows one of three statuses:

| Status | Color | Meaning |
|--------|-------|---------|
| Healthy | Green | Cookie-based auth appears correctly configured |
| Warning | Yellow | Potential misconfiguration detected |
| Error | Red | Auth misconfiguration – login may fail |

### Status Computation Logic

**Error (Red)** is shown when:
- `SESSION_SECRET` is not set in production
- `DATABASE_URL` is not configured
- `SameSite=None` with `Secure=false`

**Warning (Yellow)** is shown when:
- `NODE_ENV` is not "production" on Railway
- `trust proxy` is not enabled in production
- `APP_BASE_URL` is not set in production

**Healthy (Green)** is shown when:
- No errors or warnings detected

### Diagnostics Cards

The panel displays cards for:

1. **Auth Mode** - Shows auth type (cookie) and session store (pg)
2. **Cookie Configuration** - httpOnly, secure, sameSite settings
3. **CORS Configuration** - Credentials and origin settings
4. **Proxy / Railway** - Trust proxy and environment detection
5. **Session Store** - Session enabled, secret configured, database connected

### Common Fixes

The panel shows conditional tips based on your configuration:

- Login works locally but not on Railway → Check trust proxy
- Cookies not being set → Ensure `credentials: 'include'`
- SameSite=None issues → Ensure Secure is true
- Sessions expire immediately → Check SESSION_SECRET and database

## Railway Deployment

### Required Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection (auto-set by Railway) |
| `SESSION_SECRET` | Yes | Secure random string for sessions |
| `NODE_ENV` | Yes | Set to `production` |

### Optional Environment Variables

| Variable | Purpose |
|----------|---------|
| `COOKIE_DOMAIN` | Custom domain for cookies |
| `APP_BASE_URL` | Frontend URL for CORS |
| `API_BASE_URL` | Backend URL for CORS |

### Common Railway Issues

#### 1. "Login works locally but fails on Railway"

**Cause**: Trust proxy not enabled or NODE_ENV not set

**Fix**: 
- Ensure `app.set("trust proxy", 1)` is in server code (already configured)
- Set `NODE_ENV=production` in Railway

#### 2. "Need to login twice"

**Cause**: Cookie not persisting across requests

**Fix**:
- Verify `trust proxy` is enabled
- Confirm `NODE_ENV=production`
- Check browser devtools for `Set-Cookie` header

#### 3. "Session expires immediately"

**Cause**: Session not stored in database

**Fix**:
- Verify `DATABASE_URL` is set
- Ensure `SESSION_SECRET` is configured
- Check database connectivity

#### 4. "Cookies not being set"

**Cause**: Frontend not sending credentials

**Fix**:
- Ensure all fetch calls include `credentials: 'include'`
- Verify CORS is configured for credentials

### Verification Steps

After deployment:

1. **Login works once** - Single login should authenticate you
2. **Session persists** - Refreshing keeps you logged in
3. **`/api/auth/me` returns user** - Check devtools
4. **Auth Diagnostics shows "Healthy"** - No errors or warnings

## API Endpoints

### POST /api/v1/auth/login

Login with email and password.

```json
Request:
{
  "email": "user@example.com",
  "password": "password123"
}

Response (200):
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user"
}
```

### GET /api/auth/me

Get current authenticated user.

```json
Response (200):
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "tenantId": "tenant_456"
}
```

### POST /api/v1/auth/logout

Log out current user.

```json
Response (200):
{
  "message": "Logged out successfully"
}
```

### GET /api/v1/super/status/auth-diagnostics

Get auth configuration diagnostics (Super Admin only).

```json
Response (200):
{
  "authType": "cookie",
  "overallStatus": "healthy",
  "cookies": {
    "httpOnly": true,
    "secure": true,
    "sameSite": "lax",
    "domainConfigured": false,
    "maxAgeDays": 30
  },
  "cors": {
    "credentialsEnabled": true,
    "allowedOriginConfigured": true
  },
  "proxy": {
    "trustProxyEnabled": true
  },
  "session": {
    "enabled": true,
    "storeType": "pg",
    "secretConfigured": true
  },
  "runtime": {
    "nodeEnv": "production",
    "isRailway": true,
    "databaseConfigured": true
  },
  "issues": [],
  "warnings": [],
  "commonFixes": [],
  "lastAuthCheck": "2024-01-15T12:00:00.000Z"
}
```

## Security Notes

- Session secrets are never exposed via API
- Auth diagnostics only show existence of config, not values
- Super Admin access required for diagnostics
- All passwords are hashed using scrypt

## Related Documentation

- [BOOTSTRAP_SUPER_ADMIN.md](./BOOTSTRAP_SUPER_ADMIN.md) - First admin account creation
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - API error codes and handling
