# Environment Variables Reference

This document lists all environment variables used by MyWorkDay, their purpose, and requirements.

## Critical (Required in Production)

These variables **must** be set in production. The application will fail to start without them.

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Session encryption key (minimum 32 characters) | `<random-64-char-string>` |

## Startup Behavior

Control how the application starts and validates its environment.

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode: `development` or `production` |
| `PORT` | `5000` | HTTP server port |
| `AUTO_MIGRATE` | `false` | Run Drizzle migrations automatically on startup |
| `FAST_STARTUP` | `false` | Skip detailed diagnostics for faster startup |
| `SKIP_PARITY_CHECK` | `false` | Skip production parity check during startup |
| `FAIL_ON_SCHEMA_ISSUES` | `true` | Fail startup if schema is incomplete (always true in production) |

## Rate Limiting

Rate limiting is enabled by default in production.

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `true` | Master switch for rate limiting |
| `RATE_LIMIT_DEV_ENABLED` | `false` | Enable rate limiting in development mode |
| `RATE_LIMIT_DEBUG` | `false` | Log all rate limit checks (verbose) |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | `60000` | Login rate limit window (ms) |
| `RATE_LIMIT_LOGIN_MAX_IP` | `10` | Max login attempts per IP per window |
| `RATE_LIMIT_LOGIN_MAX_EMAIL` | `5` | Max login attempts per email per window |
| `RATE_LIMIT_BOOTSTRAP_WINDOW_MS` | `60000` | Bootstrap registration window (ms) |
| `RATE_LIMIT_BOOTSTRAP_MAX_IP` | `5` | Max bootstrap attempts per IP per window |
| `RATE_LIMIT_INVITE_WINDOW_MS` | `60000` | Invite acceptance window (ms) |
| `RATE_LIMIT_INVITE_MAX_IP` | `10` | Max invite accepts per IP per window |
| `RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS` | `60000` | Forgot password window (ms) |
| `RATE_LIMIT_FORGOT_PASSWORD_MAX_IP` | `5` | Max forgot password requests per IP |
| `RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL` | `3` | Max forgot password requests per email |
| `RATE_LIMIT_UPLOAD_WINDOW_MS` | `60000` | File upload presign window (ms) |
| `RATE_LIMIT_UPLOAD_MAX_IP` | `30` | Max upload presigns per IP per window |

## Cloudflare R2 Storage

File storage for uploads, attachments, and exports. Optional if tenants configure their own R2.

| Variable | Required | Description |
|----------|----------|-------------|
| `CF_R2_ACCOUNT_ID` | For file uploads | Cloudflare account ID |
| `CF_R2_ACCESS_KEY_ID` | For file uploads | R2 access key ID |
| `CF_R2_SECRET_ACCESS_KEY` | For file uploads | R2 secret access key |
| `CF_R2_BUCKET_NAME` | For file uploads | R2 bucket name |
| `CF_R2_PUBLIC_URL` | Optional | Public URL prefix for bucket |

## Email (Mailgun)

Required for sending emails (invitations, password resets, notifications).

| Variable | Required | Description |
|----------|----------|-------------|
| `MAILGUN_API_KEY` | For email | Mailgun API key |
| `MAILGUN_DOMAIN` | For email | Mailgun domain |
| `MAILGUN_FROM_EMAIL` | Optional | Default from address |
| `MAILGUN_DEBUG` | Optional | Enable debug logging |
| `EMAIL_DEBUG` | Optional | Enable email debug logging |

## Google OAuth

Required for Google SSO login.

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | For Google SSO | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google SSO | Google OAuth client secret |

## Stripe Billing

Required for payment processing and billing features.

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | For billing | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | For webhooks | Stripe webhook signing secret |

## AI Features

Required for AI-powered features.

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | For AI features | OpenAI API key (preferred) |
| `OPENAI_API_KEY` | For AI features | OpenAI API key (fallback) |

## Git/Deployment Info

Automatically set by deployment platforms.

| Variable | Source | Description |
|----------|--------|-------------|
| `RAILWAY_GIT_COMMIT_SHA` | Railway | Git commit SHA |
| `RAILWAY_GIT_BRANCH` | Railway | Git branch name |
| `GIT_COMMIT_SHA` | Manual | Git commit SHA (fallback) |
| `GIT_BRANCH` | Manual | Git branch (fallback) |

## Health Check Endpoints

The application provides these health check endpoints for deployment platforms:

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health` | Liveness check | Always returns 200 if process is alive |
| `/healthz` | Kubernetes-style liveness | Returns "ok" |
| `/ready` | Readiness check | Returns 200 only if DB reachable + migrations ok |

### Recommended Health Check Configuration

**Railway/Replit:**
- Health check endpoint: `/ready`
- This ensures traffic is only routed after the app is fully initialized

**Kubernetes:**
- Liveness probe: `/healthz`
- Readiness probe: `/ready`

## Production Deployment Checklist

Before deploying to production, ensure:

1. **Critical variables are set:**
   - [ ] `DATABASE_URL` - PostgreSQL connection string
   - [ ] `SESSION_SECRET` - Strong random string (32+ chars)

2. **Startup settings:**
   - [ ] `NODE_ENV=production`
   - [ ] `AUTO_MIGRATE=true` (recommended for Railway/Replit)
   - [ ] `FAST_STARTUP=true` (recommended for faster cold starts)

3. **Optional features configured:**
   - [ ] Cloudflare R2 for file storage
   - [ ] Mailgun for email sending
   - [ ] Google OAuth for SSO
   - [ ] Stripe for billing

## Validation

The application validates configuration at startup:

- **Production mode:** Fails immediately if critical variables are missing
- **Development mode:** Logs warnings but continues with safe defaults

Check startup logs for `[config]` entries to verify configuration status.
