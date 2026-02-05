# Billing & Subscriptions

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

The billing system manages tenant subscriptions, payment processing via Stripe, and feature access based on subscription tiers. It handles the full lifecycle from trial to paid subscription to cancellation.

---

## Who Uses It

| Role | Access Level |
|------|--------------|
| **Super Admin** | View all tenant billing, override subscription states |
| **Admin** | Manage their tenant's subscription, view invoices |
| **Manager** | View subscription status (read-only) |
| **Member** | No billing access |

---

## Data Model

### Tenant Billing Fields

| Field | Type | Description |
|-------|------|-------------|
| `stripeCustomerId` | string | Stripe customer ID |
| `stripeSubscriptionId` | string | Active subscription ID |
| `subscriptionStatus` | enum | `trialing`, `active`, `past_due`, `canceled`, `unpaid` |
| `subscriptionPlan` | string | Plan identifier (e.g., `pro`, `enterprise`) |
| `trialEndsAt` | timestamp | Trial expiration date |
| `billingEmail` | string | Email for invoices |
| `currentPeriodEnd` | timestamp | Current billing period end |

### Subscription Plans

| Plan | Features | Price |
|------|----------|-------|
| **Free** | 5 users, 3 projects, basic features | $0/mo |
| **Pro** | 25 users, unlimited projects, reports | $XX/mo |
| **Enterprise** | Unlimited, SSO, priority support | Custom |

---

## Key Flows

### 1. Trial Start

```
Tenant creation
    ↓
Set subscriptionStatus = 'trialing'
Set trialEndsAt = now + 14 days
    ↓
Full feature access during trial
```

### 2. Subscription Upgrade

```
Admin clicks "Upgrade" → Stripe Checkout session
    ↓
User completes payment on Stripe
    ↓
Webhook: checkout.session.completed
    ↓
Update tenant: subscriptionStatus = 'active'
Store stripeSubscriptionId
```

### 3. Webhook Processing

```
POST /api/v1/webhooks/stripe
    ↓
Verify signature → Parse event type
    ↓
Handle: invoice.paid, invoice.payment_failed,
        customer.subscription.updated,
        customer.subscription.deleted
    ↓
Update tenant billing state
```

### 4. Subscription Cancellation

```
Admin requests cancellation
    ↓
Stripe: subscription canceled at period end
    ↓
Webhook: customer.subscription.updated
    ↓
Access continues until currentPeriodEnd
    ↓
Webhook: customer.subscription.deleted
    ↓
subscriptionStatus = 'canceled'
Feature access restricted to Free tier
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **Payment failure** | Status → `past_due`, 3 retry attempts, then `unpaid` |
| **Trial expiry** | Downgrade to Free tier, prompt to upgrade |
| **Plan downgrade** | Immediate effect, prorated refund |
| **Duplicate webhooks** | Idempotent processing via event ID |
| **Stripe outage** | Queue webhooks, retry with exponential backoff |
| **Refund requested** | Manual process via Super Admin |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **View Subscription** | Settings > Billing | Current plan, usage, next billing |
| **Upgrade/Downgrade** | Settings > Billing | Change subscription plan |
| **View Invoices** | Settings > Billing | Invoice history and downloads |
| **Update Payment** | Settings > Billing | Update card via Stripe portal |
| **Cancel Subscription** | Settings > Billing | Cancel at period end |
| **Override Status** | Super Admin > Tenants | Force subscription state (Super Admin) |
| **Extend Trial** | Super Admin > Tenants | Extend trial period (Super Admin) |

---

## Stripe Integration

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/tenant/billing/checkout` | Create Checkout session |
| `POST /api/v1/tenant/billing/portal` | Create Customer Portal session |
| `POST /api/v1/webhooks/stripe` | Receive Stripe webhooks |
| `GET /api/v1/tenant/billing` | Get billing status |

---

## Related Documentation

- [Integrations - Stripe](../INTEGRATIONS_STRIPE.md)
- [Webhooks](../webhooks/)
