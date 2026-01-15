import { Router } from "express";
import { db } from "../db";
import { tenants, systemSettings, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { UserRole } from "@shared/schema";
import { decryptValue, isEncryptionAvailable } from "../lib/encryption";
import Stripe from "stripe";

const router = Router();

function requireTenantAdmin(req: any, res: any, next: any) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: { code: "unauthorized", message: "Authentication required" } });
  }
  
  const isSuperUser = user.role === UserRole.SUPER_USER;
  const isAdmin = user.role === UserRole.ADMIN;
  
  if (!isSuperUser && !isAdmin) {
    return res.status(403).json({ 
      error: { 
        code: "forbidden", 
        message: "Admin access required" 
      } 
    });
  }
  
  next();
}

async function getStripeClient(): Promise<Stripe | null> {
  const [settings] = await db.select().from(systemSettings).limit(1);
  
  if (!settings?.stripeSecretKeyEncrypted || !isEncryptionAvailable()) {
    return null;
  }
  
  try {
    const secretKey = decryptValue(settings.stripeSecretKeyEncrypted);
    return new Stripe(secretKey, { apiVersion: "2025-12-15.clover" });
  } catch (error) {
    console.error("Failed to initialize Stripe client:", error);
    return null;
  }
}

async function getTenantForBilling(req: any): Promise<{ tenantId: string; tenant: any } | null> {
  const user = req.user;
  const isSuperUser = user?.role === UserRole.SUPER_USER;
  
  let tenantId: string;
  
  if (isSuperUser) {
    tenantId = req.headers["x-tenant-id"] as string;
    if (!tenantId) {
      return null;
    }
  } else {
    tenantId = user?.tenantId;
    if (!tenantId) {
      return null;
    }
  }
  
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) {
    return null;
  }
  
  return { tenantId, tenant };
}

router.get("/billing", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      return res.status(400).json({ 
        error: { code: "tenant_required", message: "Tenant context required" } 
      });
    }
    
    const { tenant } = tenantData;
    
    res.json({
      billingEmail: tenant.billingEmail || null,
      hasPaymentMethod: !!tenant.stripeDefaultPaymentMethodId,
      stripeCustomerIdPresent: !!tenant.stripeCustomerId,
      billingStatus: tenant.billingStatus || "none",
      invoicesEnabled: !!tenant.stripeCustomerId,
    });
  } catch (error) {
    console.error("Error fetching billing info:", error);
    res.status(500).json({ error: { code: "internal_error", message: "Failed to fetch billing info" } });
  }
});

router.post("/billing/initialize", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      return res.status(400).json({ 
        error: { code: "tenant_required", message: "Tenant context required" } 
      });
    }
    
    const { tenantId, tenant } = tenantData;
    
    if (tenant.stripeCustomerId) {
      return res.json({
        success: true,
        message: "Billing already initialized",
        billingEmail: tenant.billingEmail || null,
        hasPaymentMethod: !!tenant.stripeDefaultPaymentMethodId,
        stripeCustomerIdPresent: true,
        billingStatus: tenant.billingStatus || "none",
      });
    }
    
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(400).json({ 
        error: { 
          code: "stripe_not_configured", 
          message: "Stripe is not configured. Please contact the platform administrator." 
        } 
      });
    }
    
    const [tenantSettings] = await db.select()
      .from(require("@shared/schema").tenantSettings)
      .where(eq(require("@shared/schema").tenantSettings.tenantId, tenantId));
    
    const ownerEmail = req.user?.email || tenant.billingEmail;
    
    const customer = await stripe.customers.create({
      name: tenantSettings?.displayName || tenant.name,
      email: ownerEmail,
      metadata: {
        tenantId: tenantId,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      },
    });
    
    await db.update(tenants)
      .set({
        stripeCustomerId: customer.id,
        billingEmail: ownerEmail || null,
        billingStatus: "none",
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));
    
    console.log(`[Billing] Created Stripe customer ${customer.id} for tenant ${tenantId}`);
    
    res.json({
      success: true,
      message: "Billing initialized successfully",
      billingEmail: ownerEmail || null,
      hasPaymentMethod: false,
      stripeCustomerIdPresent: true,
      billingStatus: "none",
    });
  } catch (error: any) {
    console.error("Error initializing billing:", error);
    
    if (error.type?.startsWith("Stripe")) {
      return res.status(400).json({ 
        error: { 
          code: "stripe_error", 
          message: error.message || "Stripe error occurred" 
        } 
      });
    }
    
    res.status(500).json({ error: { code: "internal_error", message: "Failed to initialize billing" } });
  }
});

router.post("/billing/portal-session", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      return res.status(400).json({ 
        error: { code: "tenant_required", message: "Tenant context required" } 
      });
    }
    
    const { tenant } = tenantData;
    
    if (!tenant.stripeCustomerId) {
      return res.status(400).json({ 
        error: { 
          code: "billing_not_initialized", 
          message: "Billing has not been initialized. Please initialize billing first." 
        } 
      });
    }
    
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(400).json({ 
        error: { 
          code: "stripe_not_configured", 
          message: "Stripe is not configured. Please contact the platform administrator." 
        } 
      });
    }
    
    const host = req.get("host");
    const protocol = req.protocol;
    const returnUrl = `${protocol}://${host}/settings?tab=billing`;
    
    if (!host || !returnUrl.includes(host)) {
      return res.status(400).json({ 
        error: { code: "invalid_return_url", message: "Invalid return URL" } 
      });
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl,
    });
    
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating portal session:", error);
    
    if (error.type?.startsWith("Stripe")) {
      return res.status(400).json({ 
        error: { 
          code: "stripe_error", 
          message: error.message || "Stripe error occurred" 
        } 
      });
    }
    
    res.status(500).json({ error: { code: "internal_error", message: "Failed to create portal session" } });
  }
});

router.get("/billing/invoices", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      return res.status(400).json({ 
        error: { code: "tenant_required", message: "Tenant context required" } 
      });
    }
    
    const { tenant } = tenantData;
    
    if (!tenant.stripeCustomerId) {
      return res.json({ invoices: [], hasMore: false });
    }
    
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(400).json({ 
        error: { 
          code: "stripe_not_configured", 
          message: "Stripe is not configured." 
        } 
      });
    }
    
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    
    const invoices = await stripe.invoices.list({
      customer: tenant.stripeCustomerId,
      limit,
    });
    
    const safeInvoices = invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
      amount: inv.amount_due,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdfUrl: inv.invoice_pdf,
      description: inv.description,
    }));
    
    res.json({
      invoices: safeInvoices,
      hasMore: invoices.has_more,
    });
  } catch (error: any) {
    console.error("Error fetching invoices:", error);
    
    if (error.type?.startsWith("Stripe")) {
      return res.status(400).json({ 
        error: { 
          code: "stripe_error", 
          message: error.message || "Stripe error occurred" 
        } 
      });
    }
    
    res.status(500).json({ error: { code: "internal_error", message: "Failed to fetch invoices" } });
  }
});

router.patch("/billing/email", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      return res.status(400).json({ 
        error: { code: "tenant_required", message: "Tenant context required" } 
      });
    }
    
    const { tenantId, tenant } = tenantData;
    const { billingEmail } = req.body;
    
    if (!billingEmail || typeof billingEmail !== "string") {
      return res.status(400).json({ 
        error: { code: "invalid_email", message: "Valid email required" } 
      });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(billingEmail)) {
      return res.status(400).json({ 
        error: { code: "invalid_email", message: "Invalid email format" } 
      });
    }
    
    await db.update(tenants)
      .set({
        billingEmail,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));
    
    if (tenant.stripeCustomerId) {
      const stripe = await getStripeClient();
      if (stripe) {
        await stripe.customers.update(tenant.stripeCustomerId, {
          email: billingEmail,
        });
      }
    }
    
    res.json({ success: true, billingEmail });
  } catch (error) {
    console.error("Error updating billing email:", error);
    res.status(500).json({ error: { code: "internal_error", message: "Failed to update billing email" } });
  }
});

export default router;
