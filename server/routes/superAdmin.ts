import { Router } from "express";
import { storage } from "../storage";
import { requireSuperUser } from "../middleware/tenantContext";
import { insertTenantSchema, TenantStatus, UserRole, tenants, workspaces, invitations, tenantSettings, tenantNotes, tenantAuditEvents, NoteCategory, clients, clientContacts, projects } from "@shared/schema";
import { hashPassword } from "../auth";
import { z } from "zod";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, sql, desc, and, ilike } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { tenantIntegrationService, IntegrationProvider } from "../services/tenantIntegrations";
import multer from "multer";
import { validateBrandAsset, generateBrandAssetKey, uploadToS3, isS3Configured } from "../s3";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const router = Router();

// =============================================================================
// BOOTSTRAP ENDPOINT - One-time super admin creation for production deployment
// =============================================================================

const bootstrapSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

router.post("/bootstrap", async (req, res) => {
  try {
    // Check if bootstrap token is configured
    const bootstrapToken = process.env.SUPER_ADMIN_BOOTSTRAP_TOKEN;
    if (!bootstrapToken) {
      return res.status(503).json({ 
        error: "Bootstrap not configured",
        message: "SUPER_ADMIN_BOOTSTRAP_TOKEN environment variable is not set"
      });
    }

    // Verify the bootstrap token from header using timing-safe comparison
    const providedToken = req.headers["x-bootstrap-token"];
    if (!providedToken || typeof providedToken !== "string" || !safeCompare(providedToken, bootstrapToken)) {
      return res.status(401).json({ error: "Invalid bootstrap token" });
    }

    // Check if a super_user already exists
    const existingSuperUsers = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .limit(1);

    if (existingSuperUsers.length > 0) {
      return res.status(409).json({ 
        error: "Super admin already initialized",
        message: "A super user account already exists. Bootstrap can only be used once."
      });
    }

    // Parse optional body overrides
    const body = bootstrapSchema.parse(req.body || {});

    // Get credentials from env vars or body
    const email = body.email || process.env.SUPER_ADMIN_EMAIL;
    const password = body.password || process.env.SUPER_ADMIN_PASSWORD;
    const firstName = body.firstName || process.env.SUPER_ADMIN_FIRST_NAME || "Super";
    const lastName = body.lastName || process.env.SUPER_ADMIN_LAST_NAME || "Admin";

    if (!email) {
      return res.status(400).json({ 
        error: "Email required",
        message: "Provide email in request body or set SUPER_ADMIN_EMAIL environment variable"
      });
    }

    if (!password) {
      return res.status(400).json({ 
        error: "Password required",
        message: "Provide password in request body or set SUPER_ADMIN_PASSWORD environment variable"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        error: "Password too short",
        message: "Password must be at least 8 characters"
      });
    }

    // Check if email is already in use
    const existingUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        error: "Email already in use",
        message: "A user with this email already exists"
      });
    }

    // Hash password and create super user
    const passwordHash = await hashPassword(password);
    
    const [superUser] = await db.insert(users).values({
      email,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      passwordHash,
      role: UserRole.SUPER_USER,
      isActive: true,
      tenantId: null, // Super users are not tied to a specific tenant
    }).returning({ id: users.id, email: users.email, name: users.name });

    // Log success (no sensitive data)
    console.log("[bootstrap] Super admin initialized");

    res.status(201).json({
      success: true,
      message: "Super admin account created successfully",
      user: {
        id: superUser.id,
        email: superUser.email,
        name: superUser.name,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[bootstrap] Error during super admin bootstrap:", error);
    res.status(500).json({ error: "Bootstrap failed" });
  }
});

// =============================================================================
// TENANT MANAGEMENT ROUTES (requires authenticated super_user)
// =============================================================================

router.get("/tenants", requireSuperUser, async (req, res) => {
  try {
    const tenants = await storage.getAllTenants();
    res.json(tenants);
  } catch (error) {
    console.error("Error fetching tenants:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

router.get("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    console.error("Error fetching tenant:", error);
    res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

const createTenantSchema = insertTenantSchema.extend({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

router.post("/tenants", requireSuperUser, async (req, res) => {
  try {
    const data = createTenantSchema.parse(req.body);
    
    const existingTenant = await storage.getTenantBySlug(data.slug);
    if (existingTenant) {
      return res.status(409).json({ error: "A tenant with this slug already exists" });
    }
    
    // Transactional: Create tenant + primary workspace + tenant_settings
    const result = await db.transaction(async (tx) => {
      // 1. Create tenant (inactive by default)
      const [tenant] = await tx.insert(tenants).values({
        ...data,
        status: TenantStatus.INACTIVE,
      }).returning();

      // 2. Create primary workspace with exact business name
      const [primaryWorkspace] = await tx.insert(workspaces).values({
        name: data.name.trim(),
        tenantId: tenant.id,
        isPrimary: true,
      }).returning();

      // 3. Create tenant_settings record (inside transaction for rollback safety)
      await tx.insert(tenantSettings).values({
        tenantId: tenant.id,
        displayName: tenant.name,
      });

      return { tenant, primaryWorkspace };
    });

    console.log(`[SuperAdmin] Created tenant ${result.tenant.id} with primary workspace ${result.primaryWorkspace.id}`);

    // Record audit events
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      result.tenant.id,
      "tenant_created",
      `Tenant "${result.tenant.name}" created`,
      superUser?.id,
      { slug: result.tenant.slug }
    );
    await recordTenantAuditEvent(
      result.tenant.id,
      "workspace_created",
      `Primary workspace "${result.primaryWorkspace.name}" created`,
      superUser?.id,
      { workspaceId: result.primaryWorkspace.id, isPrimary: true }
    );

    res.status(201).json({
      ...result.tenant,
      primaryWorkspaceId: result.primaryWorkspace.id,
      primaryWorkspace: {
        id: result.primaryWorkspace.id,
        name: result.primaryWorkspace.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant:", error);
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  status: z.enum([TenantStatus.ACTIVE, TenantStatus.INACTIVE, TenantStatus.SUSPENDED]).optional(),
});

router.patch("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const data = updateTenantSchema.parse(req.body);
    
    const tenant = await storage.updateTenant(req.params.id, data);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant:", error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

// =============================================================================
// TENANT ACTIVATION/SUSPENSION (Pre-provisioning)
// =============================================================================

// POST /api/v1/super/tenants/:tenantId/activate
router.post("/tenants/:tenantId/activate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.ACTIVE) {
      return res.status(400).json({ error: "Tenant is already active" });
    }

    // Activate the tenant without requiring onboarding completion
    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.ACTIVE,
        activatedBySuperUserAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} activated by super user`);

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to active (activated by super user)`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "active" }
    );

    res.json({
      success: true,
      message: "Tenant activated successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error activating tenant:", error);
    res.status(500).json({ error: "Failed to activate tenant" });
  }
});

// POST /api/v1/super/tenants/:tenantId/suspend
router.post("/tenants/:tenantId/suspend", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      return res.status(400).json({ error: "Tenant is already suspended" });
    }

    // Suspend the tenant
    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.SUSPENDED,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} suspended by super user`);

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to suspended`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "suspended" }
    );

    res.json({
      success: true,
      message: "Tenant suspended successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error suspending tenant:", error);
    res.status(500).json({ error: "Failed to suspend tenant" });
  }
});

// POST /api/v1/super/tenants/:tenantId/deactivate (set back to inactive)
router.post("/tenants/:tenantId/deactivate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.INACTIVE) {
      return res.status(400).json({ error: "Tenant is already inactive" });
    }

    // Deactivate the tenant
    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.INACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} deactivated by super user`);

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to inactive`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "inactive" }
    );

    res.json({
      success: true,
      message: "Tenant deactivated successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error deactivating tenant:", error);
    res.status(500).json({ error: "Failed to deactivate tenant" });
  }
});

// =============================================================================
// TENANT WORKSPACES
// =============================================================================

// GET /api/v1/super/tenants/:tenantId/workspaces - Get all workspaces for a tenant
router.get("/tenants/:tenantId/workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantWorkspaces = await db.select().from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));

    res.json(tenantWorkspaces);
  } catch (error) {
    console.error("Error fetching tenant workspaces:", error);
    res.status(500).json({ error: "Failed to fetch tenant workspaces" });
  }
});

// =============================================================================
// PHASE 3A: TENANT ADMIN INVITATION
// =============================================================================

const inviteAdminSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  expiresInDays: z.number().min(1).max(30).optional(),
  inviteType: z.enum(["link", "email"]).optional().default("link"),
});

router.post("/tenants/:tenantId/invite-admin", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const data = inviteAdminSchema.parse(req.body);

    // Verify tenant exists
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get or create a default workspace for the tenant
    // For now, we'll create a new one if none exists
    let workspaceId: string;
    const allWorkspaces = await db.select().from(workspaces);
    const tenantWorkspace = allWorkspaces.find(w => w.name === `${tenant.name} Workspace`);
    
    if (tenantWorkspace) {
      workspaceId = tenantWorkspace.id;
    } else {
      // Create a default workspace for the tenant
      const [newWorkspace] = await db.insert(workspaces).values({
        name: `${tenant.name} Workspace`,
      }).returning();
      workspaceId = newWorkspace.id;
    }

    // Get the super user's ID from the request
    const superUser = req.user as any;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Create the invitation
    const { invitation, token } = await storage.createTenantAdminInvitation({
      tenantId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      expiresInDays: data.expiresInDays,
      createdByUserId: superUser.id,
      workspaceId,
    });

    // Build the invite URL
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const inviteUrl = `${baseUrl}/invite/${token}`;

    let emailSent = false;
    let emailError: string | null = null;

    // If email type is requested, attempt to send email via Mailgun
    if (data.inviteType === "email") {
      try {
        // Check if Mailgun is configured for this tenant
        const mailgunConfig = await tenantIntegrationService.getIntegrationWithSecrets(tenantId, "mailgun");
        
        if (mailgunConfig && mailgunConfig.publicConfig && mailgunConfig.secretConfig) {
          // Mailgun is configured - send the email
          const { domain, fromEmail, replyTo } = mailgunConfig.publicConfig as { domain: string; fromEmail: string; replyTo?: string };
          const { apiKey } = mailgunConfig.secretConfig as { apiKey: string };
          
          // Basic email sending via Mailgun API
          const FormData = (await import("form-data")).default;
          const Mailgun = (await import("mailgun.js")).default;
          const mailgun = new Mailgun(FormData);
          const mg = mailgun.client({ username: "api", key: apiKey });
          
          await mg.messages.create(domain, {
            from: fromEmail,
            to: [data.email],
            subject: `You're invited to join ${tenant.name}`,
            text: `You've been invited to become an admin for ${tenant.name}.\n\nClick the link below to accept your invitation:\n${inviteUrl}\n\nThis invitation expires in ${data.expiresInDays || 7} days.`,
            html: `<p>You've been invited to become an admin for <strong>${tenant.name}</strong>.</p><p><a href="${inviteUrl}">Click here to accept your invitation</a></p><p>This invitation expires in ${data.expiresInDays || 7} days.</p>`,
            ...(replyTo ? { "h:Reply-To": replyTo } : {}),
          });
          
          emailSent = true;
        } else {
          emailError = "Mailgun is not configured for this tenant. The invite link has been generated instead.";
        }
      } catch (mailError) {
        console.error("Error sending invitation email:", mailError);
        emailError = "Failed to send email. The invite link has been generated instead.";
      }
    }

    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_created",
      `Admin invitation created for ${data.email}`,
      superUser.id,
      { email: data.email, role: "admin", emailSent }
    );

    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        tenantId: invitation.tenantId,
      },
      inviteUrl,
      inviteType: data.inviteType,
      emailSent,
      emailError,
      message: emailSent 
        ? `Email invitation sent to ${data.email}. The invite link has also been generated.`
        : "Invitation created successfully. Share the invite URL with the tenant admin.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant admin invitation:", error);
    res.status(500).json({ error: "Failed to create invitation" });
  }
});

// =============================================================================
// BULK CSV IMPORT - Import users from CSV with invite links
// =============================================================================

const csvUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(["admin", "employee"]).optional().default("employee"),
});

const bulkImportSchema = z.object({
  users: z.array(csvUserSchema).min(1, "At least one user is required").max(500, "Maximum 500 users per import"),
  expiresInDays: z.number().min(1).max(30).optional(),
  sendInvite: z.boolean().optional().default(false),
  workspaceName: z.string().min(1).optional(),
});

interface ImportResult {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  success: boolean;
  inviteUrl?: string;
  emailSent?: boolean;
  error?: string;
}

router.post("/tenants/:tenantId/import-users", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const data = bulkImportSchema.parse(req.body);

    // Verify tenant exists
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get or create a workspace for the tenant (use workspaceName if provided)
    let workspaceId: string;
    const targetWorkspaceName = data.workspaceName || `${tenant.name} Workspace`;
    const allWorkspaces = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenantId));
    const tenantWorkspace = allWorkspaces.find(w => w.name === targetWorkspaceName) 
      || allWorkspaces.find(w => w.isPrimary === true)
      || allWorkspaces[0];
    
    if (tenantWorkspace) {
      workspaceId = tenantWorkspace.id;
    } else {
      const [newWorkspace] = await db.insert(workspaces).values({
        name: targetWorkspaceName,
        tenantId,
        isPrimary: true,
      }).returning();
      workspaceId = newWorkspace.id;
    }

    const superUser = req.user as any;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const results: ImportResult[] = [];

    // Check for existing emails to avoid duplicates
    const existingEmails = new Set(
      (await db.select({ email: users.email }).from(users))
        .map(u => u.email.toLowerCase())
    );

    // Process each user
    for (const user of data.users) {
      const emailLower = user.email.toLowerCase();
      
      // Skip if email already exists as a user
      if (existingEmails.has(emailLower)) {
        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: false,
          error: "Email already exists in the system",
        });
        continue;
      }

      try {
        // Create the invitation
        const { invitation, token } = await storage.createTenantAdminInvitation({
          tenantId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          expiresInDays: data.expiresInDays,
          createdByUserId: superUser.id,
          workspaceId,
        });

        // Override the role if not admin (the storage method defaults to admin)
        if (user.role === "employee") {
          await db.update(invitations)
            .set({ role: "employee" })
            .where(eq(invitations.id, invitation.id));
        }

        const inviteUrl = `${baseUrl}/invite/${token}`;

        // Send email if sendInvite is true
        let emailSent = false;
        if (data.sendInvite) {
          try {
            const mailgunIntegration = await tenantIntegrationService.getIntegration(tenantId, "mailgun");
            if (mailgunIntegration?.status === "configured" && mailgunIntegration.config) {
              const inviteEmailService = new InviteEmailService({
                apiKey: mailgunIntegration.config.apiKey as string,
                domain: mailgunIntegration.config.domain as string,
                senderEmail: mailgunIntegration.config.senderEmail as string,
                senderName: mailgunIntegration.config.senderName as string,
              });
              
              const tenantSettings = await storage.getTenantSettings(tenantId);
              const appName = tenantSettings?.appName || tenantSettings?.displayName || "MyWorkDay";
              
              await inviteEmailService.sendInviteEmail({
                recipientEmail: user.email,
                recipientName: user.firstName || user.email.split("@")[0],
                inviteUrl,
                appName,
              });
              emailSent = true;
            }
          } catch (emailErr) {
            console.error(`Failed to send invite email to ${user.email}:`, emailErr);
          }
        }

        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: true,
          inviteUrl,
          emailSent,
        });
      } catch (err) {
        console.error(`Error creating invitation for ${user.email}:`, err);
        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: false,
          error: "Failed to create invitation",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const emailsSent = results.filter(r => r.emailSent).length;

    // Record audit event for bulk import
    await recordTenantAuditEvent(
      tenantId,
      "bulk_users_imported",
      `Bulk import: ${successCount} users imported, ${failCount} failed${data.sendInvite ? `, ${emailsSent} emails sent` : ''}`,
      superUser.id,
      { totalProcessed: data.users.length, successCount, failCount, emailsSent, sendInvite: data.sendInvite }
    );

    res.status(201).json({
      message: `Imported ${successCount} user(s) successfully. ${failCount} failed.`,
      totalProcessed: data.users.length,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error importing users:", error);
    res.status(500).json({ error: "Failed to import users" });
  }
});

// =============================================================================
// PHASE 3A: TENANT ONBOARDING STATUS
// =============================================================================

router.get("/tenants/:tenantId/onboarding-status", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);

    res.json({
      status: tenant.status,
      onboardedAt: tenant.onboardedAt,
      ownerUserId: tenant.ownerUserId,
      settings: settings ? {
        displayName: settings.displayName,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        supportEmail: settings.supportEmail,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching tenant onboarding status:", error);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

// Get tenants with additional info (settings, user counts)
router.get("/tenants-detail", requireSuperUser, async (req, res) => {
  try {
    const allTenants = await storage.getAllTenants();
    
    const tenantsWithDetails = await Promise.all(
      allTenants.map(async (tenant) => {
        const settings = await storage.getTenantSettings(tenant.id);
        const tenantUsers = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.tenantId, tenant.id));
        
        return {
          ...tenant,
          settings,
          userCount: Number(tenantUsers[0]?.count || 0),
        };
      })
    );

    res.json(tenantsWithDetails);
  } catch (error) {
    console.error("Error fetching tenants with details:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// =============================================================================
// PHASE 3B: SUPER USER TENANT SETTINGS MANAGEMENT
// =============================================================================

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const superUpdateSettingsSchema = z.object({
  displayName: z.string().min(1).optional(),
  appName: z.string().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  iconUrl: z.string().url().optional().nullable(),
  faviconUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(hexColorRegex, "Must be valid hex color").optional().nullable(),
  secondaryColor: z.string().regex(hexColorRegex, "Must be valid hex color").optional().nullable(),
  accentColor: z.string().regex(hexColorRegex, "Must be valid hex color").optional().nullable(),
  loginMessage: z.string().optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  whiteLabelEnabled: z.boolean().optional(),
  hideVendorBranding: z.boolean().optional(),
});

// GET /api/v1/super/tenants/:tenantId/settings
router.get("/tenants/:tenantId/settings", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);
    
    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
      tenantSettings: settings ? {
        displayName: settings.displayName,
        appName: settings.appName,
        logoUrl: settings.logoUrl,
        faviconUrl: settings.faviconUrl,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        loginMessage: settings.loginMessage,
        supportEmail: settings.supportEmail,
        whiteLabelEnabled: settings.whiteLabelEnabled,
        hideVendorBranding: settings.hideVendorBranding,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching tenant settings:", error);
    res.status(500).json({ error: "Failed to fetch tenant settings" });
  }
});

// PATCH /api/v1/super/tenants/:tenantId/settings
router.patch("/tenants/:tenantId/settings", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = superUpdateSettingsSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      settings = await storage.createTenantSettings({
        tenantId,
        displayName: tenant.name,
      });
    }

    const updatedSettings = await storage.updateTenantSettings(tenantId, data);
    
    res.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant settings:", error);
    res.status(500).json({ error: "Failed to update tenant settings" });
  }
});

// =============================================================================
// PHASE 3B: SUPER USER TENANT INTEGRATIONS MANAGEMENT
// =============================================================================

const validProviders: IntegrationProvider[] = ["mailgun", "s3"];

function isValidProvider(provider: string): provider is IntegrationProvider {
  return validProviders.includes(provider as IntegrationProvider);
}

// GET /api/v1/super/tenants/:tenantId/integrations
router.get("/tenants/:tenantId/integrations", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const integrations = await tenantIntegrationService.listIntegrations(tenantId);
    res.json({ integrations });
  } catch (error) {
    console.error("Error fetching tenant integrations:", error);
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// GET /api/v1/super/tenants/:tenantId/integrations/:provider
router.get("/tenants/:tenantId/integrations/:provider", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const integration = await tenantIntegrationService.getIntegration(tenantId, provider);
    
    if (!integration) {
      return res.json({
        provider,
        status: "not_configured",
        publicConfig: null,
        secretConfigured: false,
        lastTestedAt: null,
      });
    }

    res.json(integration);
  } catch (error) {
    console.error("Error fetching tenant integration:", error);
    res.status(500).json({ error: "Failed to fetch integration" });
  }
});

// PUT /api/v1/super/tenants/:tenantId/integrations/:provider
const mailgunUpdateSchema = z.object({
  domain: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional().nullable(),
  apiKey: z.string().optional(),
});

const s3UpdateSchema = z.object({
  bucketName: z.string().optional(),
  region: z.string().optional(),
  keyPrefixTemplate: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

router.put("/tenants/:tenantId/integrations/:provider", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let publicConfig: any = {};
    let secretConfig: any = {};

    if (provider === "mailgun") {
      const data = mailgunUpdateSchema.parse(req.body);
      publicConfig = {
        domain: data.domain,
        fromEmail: data.fromEmail,
        replyTo: data.replyTo,
      };
      if (data.apiKey) {
        secretConfig = { apiKey: data.apiKey };
      }
    } else if (provider === "s3") {
      const data = s3UpdateSchema.parse(req.body);
      publicConfig = {
        bucketName: data.bucketName,
        region: data.region,
        keyPrefixTemplate: data.keyPrefixTemplate || `tenants/${tenantId}/`,
      };
      if (data.accessKeyId || data.secretAccessKey) {
        secretConfig = {
          accessKeyId: data.accessKeyId,
          secretAccessKey: data.secretAccessKey,
        };
      }
    }

    const result = await tenantIntegrationService.upsertIntegration(tenantId, provider, {
      publicConfig,
      secretConfig: Object.keys(secretConfig).length > 0 ? secretConfig : undefined,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant integration:", error);
    if (error instanceof Error && error.message.includes("Encryption key")) {
      return res.status(500).json({ 
        error: { 
          code: "ENCRYPTION_KEY_MISSING", 
          message: "Encryption key not configured. Please contact administrator." 
        } 
      });
    }
    res.status(500).json({ error: "Failed to update integration" });
  }
});

// POST /api/v1/super/tenants/:tenantId/integrations/:provider/test
router.post("/tenants/:tenantId/integrations/:provider/test", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const result = await tenantIntegrationService.testIntegration(tenantId, provider);
    
    res.json(result);
  } catch (error) {
    console.error("Error testing tenant integration:", error);
    res.status(500).json({ error: "Failed to test integration" });
  }
});

// =============================================================================
// BRAND ASSET UPLOAD ENDPOINTS (SUPER ADMIN)
// =============================================================================

const validAssetTypes = ["logo", "icon", "favicon"] as const;
type AssetType = typeof validAssetTypes[number];

function isValidAssetType(type: string): type is AssetType {
  return validAssetTypes.includes(type as AssetType);
}

// POST /api/v1/super/tenants/:tenantId/settings/brand-assets - Upload brand asset for tenant
router.post("/tenants/:tenantId/settings/brand-assets", requireSuperUser, upload.single("file"), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const assetType = req.body.type as string;

    if (!isS3Configured()) {
      return res.status(503).json({ error: "S3 storage is not configured" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (!assetType || !isValidAssetType(assetType)) {
      return res.status(400).json({ error: "Invalid asset type. Must be: logo, icon, or favicon" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const mimeType = req.file.mimetype;
    const validation = validateBrandAsset(mimeType, req.file.size);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const storageKey = generateBrandAssetKey(tenantId, assetType, req.file.originalname);
    const url = await uploadToS3(req.file.buffer, storageKey, mimeType);

    // Update tenant settings with the new URL
    const fieldMap: Record<AssetType, string> = {
      logo: "logoUrl",
      icon: "iconUrl",
      favicon: "faviconUrl",
    };

    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      settings = await storage.createTenantSettings({
        tenantId,
        displayName: tenant.name,
      });
    }

    await storage.updateTenantSettings(tenantId, { [fieldMap[assetType]]: url });

    res.json({ url, type: assetType });
  } catch (error) {
    console.error("Error uploading brand asset:", error);
    res.status(500).json({ error: "Failed to upload brand asset" });
  }
});

// =============================================================================
// TENANT NOTES (Super Admin only)
// =============================================================================

const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required").max(10000, "Note too long"),
  category: z.enum(["onboarding", "support", "billing", "technical", "general"]).optional().default("general"),
});

// GET /api/v1/super/tenants/:tenantId/notes - Get all notes for a tenant
router.get("/tenants/:tenantId/notes", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const notes = await db.select({
      id: tenantNotes.id,
      tenantId: tenantNotes.tenantId,
      authorUserId: tenantNotes.authorUserId,
      body: tenantNotes.body,
      category: tenantNotes.category,
      createdAt: tenantNotes.createdAt,
    })
      .from(tenantNotes)
      .where(eq(tenantNotes.tenantId, tenantId))
      .orderBy(desc(tenantNotes.createdAt));

    // Enrich with author info
    const userIds = Array.from(new Set(notes.map(n => n.authorUserId)));
    const authorUsers = userIds.length > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`${users.id} = ANY(${userIds})`)
      : [];
    const authorMap = new Map(authorUsers.map(u => [u.id, u]));

    const enrichedNotes = notes.map(note => ({
      ...note,
      author: authorMap.get(note.authorUserId) || { id: note.authorUserId, name: "Unknown", email: "" },
    }));

    res.json(enrichedNotes);
  } catch (error) {
    console.error("Error fetching tenant notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// POST /api/v1/super/tenants/:tenantId/notes - Create a note
router.post("/tenants/:tenantId/notes", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createNoteSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const superUser = req.user as any;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [note] = await db.insert(tenantNotes).values({
      tenantId,
      authorUserId: superUser.id,
      body: data.body,
      category: data.category,
    }).returning();

    res.status(201).json({
      ...note,
      author: { id: superUser.id, name: superUser.name || "Super Admin", email: superUser.email },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant note:", error);
    res.status(500).json({ error: "Failed to create note" });
  }
});

// =============================================================================
// TENANT AUDIT EVENTS
// =============================================================================

// GET /api/v1/super/tenants/:tenantId/audit - Get audit events for a tenant
router.get("/tenants/:tenantId/audit", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const events = await db.select()
      .from(tenantAuditEvents)
      .where(eq(tenantAuditEvents.tenantId, tenantId))
      .orderBy(desc(tenantAuditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    // Enrich with actor info
    const actorIds = Array.from(new Set(events.filter(e => e.actorUserId).map(e => e.actorUserId!)));
    const actorUsers = actorIds.length > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`${users.id} = ANY(${actorIds})`)
      : [];
    const actorMap = new Map(actorUsers.map(u => [u.id, u]));

    const enrichedEvents = events.map(event => ({
      ...event,
      actor: event.actorUserId ? actorMap.get(event.actorUserId) || null : null,
    }));

    res.json({
      events: enrichedEvents,
      pagination: {
        limit,
        offset,
        hasMore: events.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching tenant audit events:", error);
    res.status(500).json({ error: "Failed to fetch audit events" });
  }
});

// =============================================================================
// TENANT HEALTH (Per-tenant)
// =============================================================================

// GET /api/v1/super/tenants/:tenantId/health - Get health summary for a specific tenant
router.get("/tenants/:tenantId/health", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get tenant settings
    const settings = await storage.getTenantSettings(tenantId);

    // Count users by role
    const userCounts = await db.select({
      role: users.role,
      count: sql<number>`count(*)::int`,
    })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .groupBy(users.role);

    const userCountMap: Record<string, number> = {};
    for (const uc of userCounts) {
      userCountMap[uc.role] = uc.count;
    }
    const totalUsers = Object.values(userCountMap).reduce((a, b) => a + b, 0);

    // Check if primary workspace exists
    const primaryWorkspace = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);

    // Get mailgun integration status (check if configured)
    let mailgunConfigured = false;
    try {
      const mailgunIntegration = await tenantIntegrationService.getIntegration(tenantId, "mailgun");
      mailgunConfigured = mailgunIntegration?.status === "configured";
    } catch {
      mailgunConfigured = false;
    }

    // Get active agreement (Phase 3C)
    const { tenantAgreements } = await import("@shared/schema");
    const activeAgreement = await db.select()
      .from(tenantAgreements)
      .where(and(eq(tenantAgreements.tenantId, tenantId), eq(tenantAgreements.status, "active")))
      .limit(1);

    // Build health summary
    const warnings: string[] = [];
    if (!primaryWorkspace.length) {
      warnings.push("No primary workspace configured");
    }
    if (totalUsers === 0) {
      warnings.push("No users in tenant");
    }
    if (!settings?.displayName) {
      warnings.push("Display name not configured");
    }

    res.json({
      tenantId,
      status: tenant.status,
      primaryWorkspaceExists: primaryWorkspace.length > 0,
      primaryWorkspace: primaryWorkspace[0] || null,
      users: {
        total: totalUsers,
        byRole: userCountMap,
      },
      agreement: {
        hasActiveAgreement: activeAgreement.length > 0,
        version: activeAgreement[0]?.version || null,
        title: activeAgreement[0]?.title || null,
      },
      integrations: {
        mailgunConfigured,
      },
      branding: {
        displayName: settings?.displayName || null,
        whiteLabelEnabled: settings?.whiteLabelEnabled || false,
        logoConfigured: !!settings?.logoUrl,
      },
      warnings,
      canEnableStrict: warnings.length === 0,
    });
  } catch (error) {
    console.error("Error fetching tenant health:", error);
    res.status(500).json({ error: "Failed to fetch tenant health" });
  }
});

// =============================================================================
// BULK DATA IMPORT (Clients & Projects)
// =============================================================================

// Schema for bulk client import
const bulkClientSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactFirstName: z.string().optional(),
  primaryContactLastName: z.string().optional(),
});

const bulkClientsImportSchema = z.object({
  clients: z.array(bulkClientSchema).min(1).max(500),
});

// POST /api/v1/super/tenants/:tenantId/clients/bulk - Bulk import clients
router.post("/tenants/:tenantId/clients/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = bulkClientsImportSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get primary workspace
    const primaryWorkspaceResult = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);
    
    if (!primaryWorkspaceResult.length) {
      return res.status(400).json({ error: "No primary workspace found for tenant" });
    }
    const workspaceId = primaryWorkspaceResult[0].id;

    // Get existing clients for deduplication
    const existingClients = await db.select({ companyName: clients.companyName, id: clients.id })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));
    const existingNamesLower = new Set(existingClients.map(c => c.companyName.toLowerCase()));

    // Track duplicates within CSV
    const seenInCsv = new Set<string>();

    const results: Array<{
      companyName: string;
      status: "created" | "skipped" | "error";
      reason?: string;
      clientId?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const clientData of data.clients) {
      const companyNameLower = clientData.companyName.trim().toLowerCase();

      // Check for duplicates in tenant
      if (existingNamesLower.has(companyNameLower)) {
        results.push({
          companyName: clientData.companyName,
          status: "skipped",
          reason: "Client already exists in tenant",
        });
        skipped++;
        continue;
      }

      // Check for duplicates within CSV
      if (seenInCsv.has(companyNameLower)) {
        results.push({
          companyName: clientData.companyName,
          status: "skipped",
          reason: "Duplicate in CSV",
        });
        skipped++;
        continue;
      }
      seenInCsv.add(companyNameLower);

      try {
        // Create client
        const [newClient] = await db.insert(clients).values({
          tenantId,
          workspaceId,
          companyName: clientData.companyName.trim(),
          industry: clientData.industry,
          website: clientData.website,
          phone: clientData.phone,
          addressLine1: clientData.address1,
          addressLine2: clientData.address2,
          city: clientData.city,
          state: clientData.state,
          postalCode: clientData.zip,
          country: clientData.country,
          notes: clientData.notes,
          status: "active",
        }).returning();

        // Create primary contact if email provided
        if (clientData.primaryContactEmail) {
          await db.insert(clientContacts).values({
            clientId: newClient.id,
            workspaceId,
            email: clientData.primaryContactEmail,
            firstName: clientData.primaryContactFirstName,
            lastName: clientData.primaryContactLastName,
            isPrimary: true,
          });
        }

        results.push({
          companyName: clientData.companyName,
          status: "created",
          clientId: newClient.id,
        });
        created++;
        existingNamesLower.add(companyNameLower);
      } catch (error: any) {
        results.push({
          companyName: clientData.companyName,
          status: "error",
          reason: error.message || "Failed to create client",
        });
        errors++;
      }
    }

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "clients_bulk_imported",
      `Bulk import: ${created} clients created, ${skipped} skipped, ${errors} errors`,
      superUser?.id,
      { created, skipped, errors, total: data.clients.length }
    );

    res.status(201).json({
      created,
      skipped,
      errors,
      results,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("Error bulk importing clients:", error);
    res.status(500).json({ error: "Failed to bulk import clients" });
  }
});

// Schema for bulk project import
const bulkProjectSchema = z.object({
  projectName: z.string().min(1),
  clientCompanyName: z.string().optional(),
  clientId: z.string().optional(),
  workspaceName: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  color: z.string().optional(),
  projectOwnerEmail: z.string().email().optional(),
});

const bulkProjectsImportSchema = z.object({
  projects: z.array(bulkProjectSchema).min(1).max(500),
  options: z.object({
    autoCreateMissingClients: z.boolean().optional(),
  }).optional(),
});

// POST /api/v1/super/tenants/:tenantId/projects/bulk - Bulk import projects
router.post("/tenants/:tenantId/projects/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = bulkProjectsImportSchema.parse(req.body);
    const autoCreateClients = data.options?.autoCreateMissingClients || false;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get workspaces for the tenant
    const tenantWorkspaces = await db.select()
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    const primaryWorkspace = tenantWorkspaces.find(w => w.isPrimary) || tenantWorkspaces[0];
    if (!primaryWorkspace) {
      return res.status(400).json({ error: "No workspace found for tenant" });
    }
    const workspaceMap = new Map(tenantWorkspaces.map(w => [w.name.toLowerCase(), w.id]));

    // Get existing clients
    const existingClients = await db.select({ companyName: clients.companyName, id: clients.id })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));
    const clientMap = new Map(existingClients.map(c => [c.companyName.toLowerCase(), c.id]));

    // Get existing projects for deduplication (by name + clientId)
    const existingProjects = await db.select({ name: projects.name, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.tenantId, tenantId));
    const existingProjectKeys = new Set(
      existingProjects.map(p => `${p.name.toLowerCase()}|${p.clientId || ""}`)
    );

    // Track created items
    const createdClients: Array<{ name: string; id: string }> = [];

    const results: Array<{
      projectName: string;
      status: "created" | "skipped" | "error";
      reason?: string;
      projectId?: string;
      clientIdUsed?: string;
      workspaceIdUsed?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const projectData of data.projects) {
      const projectNameTrimmed = projectData.projectName.trim();
      let clientIdToUse: string | null = null;
      let workspaceIdToUse = primaryWorkspace.id;

      // Resolve workspace if specified
      if (projectData.workspaceName) {
        const wsId = workspaceMap.get(projectData.workspaceName.toLowerCase());
        if (wsId) {
          workspaceIdToUse = wsId;
        }
        // If not found, use primary and continue (warning added to results)
      }

      // Resolve client
      if (projectData.clientId) {
        clientIdToUse = projectData.clientId;
      } else if (projectData.clientCompanyName) {
        const clientNameLower = projectData.clientCompanyName.trim().toLowerCase();
        const existingClientId = clientMap.get(clientNameLower);
        
        if (existingClientId) {
          clientIdToUse = existingClientId;
        } else if (autoCreateClients) {
          // Auto-create client
          try {
            const [newClient] = await db.insert(clients).values({
              tenantId,
              workspaceId: workspaceIdToUse,
              companyName: projectData.clientCompanyName.trim(),
              status: "active",
            }).returning();
            clientIdToUse = newClient.id;
            clientMap.set(clientNameLower, newClient.id);
            createdClients.push({ name: projectData.clientCompanyName.trim(), id: newClient.id });
          } catch (createErr: any) {
            results.push({
              projectName: projectNameTrimmed,
              status: "error",
              reason: `Failed to create client "${projectData.clientCompanyName}": ${createErr.message}`,
            });
            errors++;
            continue;
          }
        } else {
          results.push({
            projectName: projectNameTrimmed,
            status: "error",
            reason: `Client "${projectData.clientCompanyName}" not found. Import clients first or enable auto-create.`,
          });
          errors++;
          continue;
        }
      }

      // Check for duplicate project (name + client)
      const projectKey = `${projectNameTrimmed.toLowerCase()}|${clientIdToUse || ""}`;
      if (existingProjectKeys.has(projectKey)) {
        results.push({
          projectName: projectNameTrimmed,
          status: "skipped",
          reason: "Project with same name and client already exists",
        });
        skipped++;
        continue;
      }

      try {
        // Create project
        const [newProject] = await db.insert(projects).values({
          tenantId,
          workspaceId: workspaceIdToUse,
          clientId: clientIdToUse,
          name: projectNameTrimmed,
          description: projectData.description,
          status: projectData.status || "active",
          color: projectData.color || "#3B82F6",
        }).returning();

        results.push({
          projectName: projectNameTrimmed,
          status: "created",
          projectId: newProject.id,
          clientIdUsed: clientIdToUse || undefined,
          workspaceIdUsed: workspaceIdToUse,
        });
        created++;
        existingProjectKeys.add(projectKey);
      } catch (error: any) {
        results.push({
          projectName: projectNameTrimmed,
          status: "error",
          reason: error.message || "Failed to create project",
        });
        errors++;
      }
    }

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "projects_bulk_imported",
      `Bulk import: ${created} projects created, ${skipped} skipped, ${errors} errors${createdClients.length ? `, ${createdClients.length} clients auto-created` : ""}`,
      superUser?.id,
      { created, skipped, errors, total: data.projects.length, clientsCreated: createdClients.length }
    );

    res.status(201).json({
      created,
      skipped,
      errors,
      results,
      clientsCreated: createdClients,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("Error bulk importing projects:", error);
    res.status(500).json({ error: "Failed to bulk import projects" });
  }
});

// GET /api/v1/super/tenants/:tenantId/clients - List clients for a tenant
router.get("/tenants/:tenantId/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const search = req.query.search as string || "";

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let query = db.select().from(clients).where(eq(clients.tenantId, tenantId));
    
    if (search) {
      query = db.select().from(clients)
        .where(and(
          eq(clients.tenantId, tenantId),
          ilike(clients.companyName, `%${search}%`)
        ));
    }

    const clientList = await query.orderBy(clients.companyName);

    res.json({ clients: clientList });
  } catch (error) {
    console.error("Error fetching tenant clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// GET /api/v1/super/tenants/:tenantId/projects - List projects for a tenant
router.get("/tenants/:tenantId/projects", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const search = req.query.search as string || "";

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let query = db.select().from(projects).where(eq(projects.tenantId, tenantId));
    
    if (search) {
      query = db.select().from(projects)
        .where(and(
          eq(projects.tenantId, tenantId),
          ilike(projects.name, `%${search}%`)
        ));
    }

    const projectList = await query.orderBy(projects.name);

    // Enrich with client names
    const clientIds = Array.from(new Set(projectList.filter(p => p.clientId).map(p => p.clientId!)));
    let clientNameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const clientsData = await db.select({ id: clients.id, companyName: clients.companyName })
        .from(clients)
        .where(sql`${clients.id} = ANY(${clientIds})`);
      clientNameMap = new Map(clientsData.map(c => [c.id, c.companyName]));
    }

    const enrichedProjects = projectList.map(p => ({
      ...p,
      clientName: p.clientId ? clientNameMap.get(p.clientId) || null : null,
    }));

    res.json({ projects: enrichedProjects });
  } catch (error) {
    console.error("Error fetching tenant projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// =============================================================================
// AUDIT EVENT HELPER
// =============================================================================

export async function recordTenantAuditEvent(
  tenantId: string,
  eventType: string,
  message: string,
  actorUserId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(tenantAuditEvents).values({
      tenantId,
      actorUserId: actorUserId || null,
      eventType,
      message,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error(`[Audit] Failed to record event ${eventType} for tenant ${tenantId}:`, error);
  }
}

// =============================================================================
// SYSTEM PURGE ENDPOINT - Delete all application data (DANGER ZONE)
// =============================================================================

const PURGE_CONFIRM_PHRASE = "YES_PURGE_APP_DATA";

// Tables to purge in FK-safe order (child tables first, parent tables last)
const TABLES_TO_PURGE = [
  "user_sessions",
  "task_comments",
  "task_attachments",
  "subtasks",
  "task_assignees",
  "task_tags",
  "time_entries",
  "activity_logs",
  "personal_task_sections",
  "tasks",
  "tags",
  "sections",
  "projects",
  "client_contacts",
  "clients",
  "team_members",
  "teams",
  "workspace_members",
  "workspaces",
  "invitations",
  "tenant_integrations",
  "tenant_settings",
  "users",
  "tenants",
] as const;

router.post("/system/purge-app-data", requireSuperUser, async (req, res) => {
  try {
    // Guard 1: PURGE_APP_DATA_ALLOWED must be "true"
    if (process.env.PURGE_APP_DATA_ALLOWED !== "true") {
      return res.status(403).json({
        error: "Purge not allowed",
        message: "PURGE_APP_DATA_ALLOWED environment variable must be set to 'true'",
      });
    }

    // Guard 2: Production check
    const isProduction = process.env.NODE_ENV === "production";
    const prodAllowed = process.env.PURGE_PROD_ALLOWED === "true";

    if (isProduction && !prodAllowed) {
      return res.status(403).json({
        error: "Purge not allowed in production",
        message: "PURGE_PROD_ALLOWED environment variable must be set to 'true' for production",
      });
    }

    // Guard 3: Confirm header must match exact phrase
    const confirmHeader = req.headers["x-confirm-purge"];
    if (confirmHeader !== PURGE_CONFIRM_PHRASE) {
      return res.status(400).json({
        error: "Invalid confirmation",
        message: `X-Confirm-Purge header must be set to '${PURGE_CONFIRM_PHRASE}'`,
      });
    }

    console.log("[purge] Starting application data purge via API...");
    console.log(`[purge] Requested by user: ${(req.user as any)?.email}`);

    const results: Array<{ table: string; rowsDeleted: number; status: string }> = [];
    let totalRowsDeleted = 0;

    for (const table of TABLES_TO_PURGE) {
      try {
        // Check if table exists
        const tableExists = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${table}
          ) as exists
        `);

        if (!(tableExists.rows[0] as { exists: boolean }).exists) {
          results.push({ table, rowsDeleted: 0, status: "skipped" });
          continue;
        }

        // Get row count and delete
        const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int as count FROM "${table}"`));
        const rowCount = (countResult.rows[0] as { count: number }).count;

        if (rowCount > 0) {
          await db.execute(sql.raw(`DELETE FROM "${table}"`));
        }

        results.push({ table, rowsDeleted: rowCount, status: "success" });
        totalRowsDeleted += rowCount;
      } catch (error) {
        results.push({ table, rowsDeleted: 0, status: "error" });
      }
    }

    console.log(`[purge] Purge complete. ${totalRowsDeleted} total rows deleted.`);

    res.json({
      success: true,
      message: "Application data purged successfully",
      summary: {
        tablesProcessed: results.length,
        totalRowsDeleted,
        results,
      },
    });
  } catch (error) {
    console.error("[purge] Purge failed:", error);
    res.status(500).json({ error: "Purge failed" });
  }
});

export default router;
