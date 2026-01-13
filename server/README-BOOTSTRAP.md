# Super Admin Bootstrap Guide

This guide explains how to create the first super admin account for production deployment on Railway (or any hosting platform).

## Overview

The bootstrap mechanism ensures secure creation of the first super_user account in a fresh production database. It can only be used once - after a super admin exists, the endpoint is locked.

## Required Environment Variables

Set these in your Railway project settings (or your hosting platform's environment configuration):

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPER_ADMIN_BOOTSTRAP_TOKEN` | Yes | Secret token to authorize bootstrap requests. Generate with: `openssl rand -hex 32` |
| `SUPER_ADMIN_EMAIL` | Yes* | Email address for the super admin account |
| `SUPER_ADMIN_PASSWORD` | Yes* | Password (minimum 8 characters) |
| `SUPER_ADMIN_FIRST_NAME` | No | First name (default: "Super") |
| `SUPER_ADMIN_LAST_NAME` | No | Last name (default: "Admin") |

*Can also be provided in the request body instead of env vars.

## Method 1: HTTP Endpoint (Recommended)

### Endpoint
```
POST /api/v1/super/bootstrap
```

### Headers
```
X-Bootstrap-Token: <your-SUPER_ADMIN_BOOTSTRAP_TOKEN>
Content-Type: application/json
```

### Request Body (Optional)
If not using env vars for credentials:
```json
{
  "email": "admin@yourcompany.com",
  "password": "your-secure-password",
  "firstName": "John",
  "lastName": "Doe"
}
```

### cURL Command

Using environment variables for credentials:
```bash
curl -X POST https://your-app.railway.app/api/v1/super/bootstrap \
  -H "X-Bootstrap-Token: your-bootstrap-token-here" \
  -H "Content-Type: application/json"
```

Providing credentials in request body:
```bash
curl -X POST https://your-app.railway.app/api/v1/super/bootstrap \
  -H "X-Bootstrap-Token: your-bootstrap-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "password": "your-secure-password-min-8-chars",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Response Codes

| Code | Meaning |
|------|---------|
| 201 | Success - super admin created |
| 400 | Missing email or password |
| 401 | Invalid or missing bootstrap token |
| 409 | Super admin already exists (bootstrap locked) |
| 503 | Bootstrap token not configured on server |

### Success Response
```json
{
  "success": true,
  "message": "Super admin account created successfully",
  "user": {
    "id": "uuid-here",
    "email": "admin@yourcompany.com",
    "name": "John Doe"
  }
}
```

## Method 2: CLI Script

For Railway deployments, you can also use the CLI script via Railway's shell or a one-off command:

```bash
# Set environment variables first, then run:
npx tsx server/scripts/bootstrap_super_user.ts
```

## Railway Deployment Steps

1. **Set Environment Variables**
   - Go to your Railway project → Settings → Environment Variables
   - Add `SUPER_ADMIN_BOOTSTRAP_TOKEN` (generate with `openssl rand -hex 32`)
   - Add `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`
   - Optionally add `SUPER_ADMIN_FIRST_NAME` and `SUPER_ADMIN_LAST_NAME`

2. **Deploy Your Application**
   - Push your code or trigger a redeploy

3. **Run Bootstrap**
   - Use the cURL command above with your Railway app URL
   - Or use Railway's shell to run the CLI script

4. **Verify**
   - Go to `https://your-app.railway.app/login`
   - Login with your super admin credentials
   - Navigate to `/super-admin` to verify access

## Security Notes

- The bootstrap endpoint is protected by a secret token - keep `SUPER_ADMIN_BOOTSTRAP_TOKEN` secure
- After first use, the endpoint is permanently locked (returns 409)
- Passwords are never logged - only "Super admin initialized" is printed
- Super users have `tenantId: null` - they are not tied to any specific tenant
- Consider removing `SUPER_ADMIN_PASSWORD` from env vars after bootstrap (though it won't be used again)

## Troubleshooting

### "Bootstrap not configured" (503)
- Ensure `SUPER_ADMIN_BOOTSTRAP_TOKEN` is set in your environment variables
- Redeploy if you just added the variable

### "Invalid bootstrap token" (401)
- Check that your `X-Bootstrap-Token` header matches `SUPER_ADMIN_BOOTSTRAP_TOKEN` exactly
- Ensure no extra whitespace in the token

### "Super admin already initialized" (409)
- A super admin already exists - you cannot run bootstrap again
- If you need to reset, you must manually delete super_user records from the database

### "Email already in use" (409)
- The email you're trying to use is already registered
- Use a different email or check existing users

## Post-Bootstrap

After successful bootstrap:
1. Login at `/login` with your super admin credentials
2. Access the Super Admin panel at `/super-admin`
3. Create tenants and assign users to them
4. Consider rotating your `SUPER_ADMIN_BOOTSTRAP_TOKEN` or removing it (it won't be needed again)
