/**
 * System-Level Integration Routes
 * 
 * Manages system-wide (default) integrations using the tenant_integrations table
 * with NULL tenantId to represent system-level configurations.
 * 
 * These integrations serve as fallbacks for tenants that don't have their own configurations.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { UserRole } from "@shared/schema";
import { tenantIntegrationService } from "../services/tenantIntegrations";
import { getStorageStatus } from "../storage/getStorageProvider";
import { isEncryptionAvailable } from "../lib/encryption";

const router = Router();

function requireSuperUser(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required" } });
  }
  const user = req.user as any;
  if (user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
  }
  next();
}

const s3UpdateSchema = z.object({
  bucketName: z.string().optional(),
  region: z.string().optional(),
  keyPrefixTemplate: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

/**
 * GET /api/v1/system/integrations
 * List all system-level integrations
 */
router.get("/integrations", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integrations = await tenantIntegrationService.listIntegrations(null);
    res.json({ integrations });
  } catch (error) {
    console.error("[system-integrations] Error listing integrations:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to list integrations" } });
  }
});

/**
 * GET /api/v1/system/integrations/s3
 * Get system-level S3 configuration
 */
router.get("/integrations/s3", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integration = await tenantIntegrationService.getIntegration(null, "s3");
    
    if (!integration) {
      return res.json({
        provider: "s3",
        status: "not_configured",
        publicConfig: null,
        secretConfigured: false,
        lastTestedAt: null,
        isSystemDefault: true,
      });
    }
    
    res.json({
      ...integration,
      isSystemDefault: true,
    });
  } catch (error) {
    console.error("[system-integrations] Error getting S3 integration:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to get S3 integration" } });
  }
});

/**
 * PUT /api/v1/system/integrations/s3
 * Update system-level S3 configuration
 */
router.put("/integrations/s3", requireSuperUser, async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      return res.status(400).json({
        error: { code: "ENCRYPTION_REQUIRED", message: "Encryption key not configured. Cannot save secrets." },
      });
    }

    const data = s3UpdateSchema.parse(req.body);
    
    const result = await tenantIntegrationService.upsertIntegration(null, "s3", {
      publicConfig: {
        bucketName: data.bucketName,
        region: data.region,
        keyPrefixTemplate: data.keyPrefixTemplate,
      },
      secretConfig: {
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
      },
    });
    
    res.json({
      ...result,
      isSystemDefault: true,
    });
  } catch (error) {
    console.error("[system-integrations] Error updating S3 integration:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } });
    }
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update S3 integration" } });
  }
});

/**
 * POST /api/v1/system/integrations/s3/test
 * Test system-level S3 connection
 */
router.post("/integrations/s3/test", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const result = await tenantIntegrationService.testIntegration(null, "s3");
    res.json(result);
  } catch (error) {
    console.error("[system-integrations] Error testing S3 integration:", error);
    res.status(500).json({ success: false, message: "Failed to test S3 integration" });
  }
});

/**
 * GET /api/v1/system/storage/status
 * Get storage status for the system (including environment variables fallback)
 */
router.get("/storage/status", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const status = await getStorageStatus(null);
    res.json({
      ...status,
      encryptionConfigured: isEncryptionAvailable(),
    });
  } catch (error) {
    console.error("[system-integrations] Error checking storage status:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to check storage status" } });
  }
});

export default router;
