# Stripe Integration Guide

## Overview

MyWorkDay supports Stripe integration for tenant billing and payment processing. This document covers configuration, security practices, and webhook setup.

## Configuration

### Super Admin Setup

Navigate to **System Settings → Integrations** to configure Stripe:

1. **Publishable Key**: Your Stripe publishable key (starts with `pk_test_` or `pk_live_`)
2. **Secret Key**: Your Stripe secret key (starts with `sk_test_` or `sk_live_`)
3. **Webhook Secret**: Signing secret for webhook verification (starts with `whsec_`)
4. **Default Currency**: Platform default currency (USD, EUR, GBP, CAD, AUD)

### Environment Variables

For production, set these in your deployment environment:

```bash
# Optional: Required only if using environment-based config instead of database
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## Security

### Secret Masking (Write-Only Pattern)

All sensitive Stripe credentials follow a write-only security pattern:

- **GET requests**: Return masked values like `••••1234` (last 4 characters only)
- **PUT requests**: Accept new values to replace stored secrets
- **DELETE requests**: Clear individual secrets by name

This ensures secrets are never exposed in API responses or logs.

### Encryption at Rest

Secrets are encrypted using AES-256-GCM before database storage:

- Unique initialization vector (IV) per encryption
- Authentication tag for tamper detection
- Key derived from `ENCRYPTION_KEY` environment variable

### Webhook Signature Verification

The webhook endpoint `/api/v1/webhooks/stripe`:

- Bypasses session authentication (public endpoint)
- Verifies Stripe signature using `stripe-signature` header
- Rejects requests older than 5 minutes (replay attack prevention)
- Does NOT log full payloads (only event types)

## API Endpoints

### GET /api/v1/super/integrations/stripe

Returns Stripe configuration with masked secrets.

**Response:**
```json
{
  "config": {
    "publishableKey": "pk_test_xxx",
    "defaultCurrency": "usd"
  },
  "secretMasked": {
    "secretKeyMasked": "••••abc1",
    "webhookSecretMasked": "••••sec2"
  },
  "lastTestedAt": "2025-01-15T10:30:00.000Z"
}
```

### PUT /api/v1/super/integrations/stripe

Updates Stripe configuration. Only provided fields are updated.

**Request:**
```json
{
  "publishableKey": "pk_test_new_key",
  "secretKey": "sk_test_new_secret",
  "webhookSecret": "whsec_new_secret",
  "defaultCurrency": "eur"
}
```

### DELETE /api/v1/super/integrations/stripe/secret/:secretName

Clears a specific secret. Valid secretName values:
- `secretKey`
- `webhookSecret`

### POST /api/v1/super/integrations/stripe/test

Tests Stripe connection using `balance.retrieve()` (lightweight, no charges).

**Response (Success):**
```json
{
  "ok": true,
  "message": "Stripe connection successful"
}
```

**Response (Failure):**
```json
{
  "ok": false,
  "error": {
    "code": "authentication_error",
    "message": "Invalid API Key provided"
  }
}
```

## Webhook Endpoint

### POST /api/v1/webhooks/stripe

Public endpoint for Stripe webhook events.

**Headers Required:**
- `stripe-signature`: Stripe's signature header

**Supported Events (Scaffolding):**

| Event | Description |
|-------|-------------|
| `checkout.session.completed` | Customer completed checkout |
| `customer.subscription.created` | New subscription created |
| `customer.subscription.updated` | Subscription modified |
| `customer.subscription.deleted` | Subscription cancelled |
| `invoice.payment_succeeded` | Payment successful |
| `invoice.payment_failed` | Payment failed |
| `customer.created` | New customer created |
| `customer.updated` | Customer details updated |

### Stripe Dashboard Configuration

1. Go to **Developers → Webhooks** in Stripe Dashboard
2. Add endpoint: `https://your-domain.com/api/v1/webhooks/stripe`
3. Select events to subscribe to
4. Copy the signing secret to MyWorkDay configuration

## Test Mode vs Live Mode

### Test Mode Keys

- Publishable: `pk_test_xxx`
- Secret: `sk_test_xxx`

Use test mode for development. No real charges occur.

### Live Mode Keys

- Publishable: `pk_live_xxx`
- Secret: `sk_live_xxx`

Use live mode for production with real payments.

### Test Connection

The "Test Connection" button calls `balance.retrieve()` which:
- Validates API credentials
- Does NOT create charges or customers
- Works in both test and live mode

## Error Codes

| Code | Description |
|------|-------------|
| `authentication_error` | Invalid API key |
| `rate_limit` | Too many requests |
| `network_error` | Connection failed |
| `api_version_error` | Unsupported API version |
| `signature_verification_failed` | Webhook signature invalid |

## Current Limitations (Scaffolding)

This integration is currently a **scaffolding only**:

- ✅ Credential storage and management
- ✅ Connection testing
- ✅ Webhook signature verification
- ❌ Subscription packages (not implemented)
- ❌ Actual billing/charging (not implemented)
- ❌ Customer portal integration (not implemented)

Future phases will implement actual billing functionality.

## Troubleshooting

### "Invalid API Key" Error

1. Verify key is copied correctly (no extra spaces)
2. Check if using test key with live mode or vice versa
3. Ensure key hasn't been rolled/revoked in Stripe Dashboard

### Webhook Signature Failures

1. Verify webhook secret matches Stripe Dashboard
2. Check server clock is synchronized (NTP)
3. Ensure raw body is used for signature verification (no JSON parsing before)

### Connection Timeouts

1. Check network connectivity to api.stripe.com
2. Verify firewall allows outbound HTTPS
3. Try again (transient network issues)
