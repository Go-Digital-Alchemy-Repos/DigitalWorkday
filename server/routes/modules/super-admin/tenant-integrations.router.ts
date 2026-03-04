import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { z } from 'zod';
import { tenantIntegrationService, IntegrationProvider } from '../../../services/tenantIntegrations';

export const tenantIntegrationsRouter = Router();

const validProviders: IntegrationProvider[] = ["mailgun", "s3", "r2", "openai"];

function isValidProvider(provider: string): provider is IntegrationProvider {
  return validProviders.includes(provider as IntegrationProvider);
}

tenantIntegrationsRouter.get("/tenants/:tenantId/integrations", requireSuperUser, async (req, res) => {
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

tenantIntegrationsRouter.get("/tenants/:tenantId/integrations/:provider", requireSuperUser, async (req, res) => {
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

const r2UpdateSchema = z.object({
  bucketName: z.string().optional(),
  accountId: z.string().optional(),
  publicUrl: z.string().optional(),
  keyPrefixTemplate: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

const openaiUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.string().optional(),
  apiKey: z.string().optional(),
});

tenantIntegrationsRouter.put("/tenants/:tenantId/integrations/:provider", requireSuperUser, async (req, res) => {
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
        domain: data.domain?.trim(),
        fromEmail: data.fromEmail?.trim(),
        replyTo: data.replyTo?.trim(),
      };
      if (data.apiKey) {
        secretConfig = { apiKey: data.apiKey };
      }
    } else if (provider === "s3") {
      const data = s3UpdateSchema.parse(req.body);
      publicConfig = {
        bucketName: data.bucketName?.trim(),
        region: data.region?.trim(),
        keyPrefixTemplate: data.keyPrefixTemplate || `tenants/${tenantId}/`,
      };
      if (data.accessKeyId || data.secretAccessKey) {
        secretConfig = {
          accessKeyId: data.accessKeyId?.trim(),
          secretAccessKey: data.secretAccessKey,
        };
      }
    } else if (provider === "r2") {
      const data = r2UpdateSchema.parse(req.body);
      const accountId = data.accountId?.trim();
      const bucketName = data.bucketName?.trim();
      const endpoint = accountId
        ? `https://${accountId}.r2.cloudflarestorage.com`
        : undefined;
      const publicUrl = data.publicUrl?.trim() || endpoint;
      publicConfig = {
        bucketName,
        region: "auto",
        accountId,
        endpoint,
        publicUrl,
        keyPrefixTemplate: data.keyPrefixTemplate || `tenants/${tenantId}/`,
      };
      if (data.accessKeyId || data.secretAccessKey) {
        secretConfig = {
          accessKeyId: data.accessKeyId?.trim(),
          secretAccessKey: data.secretAccessKey,
        };
      }
    } else if (provider === "openai") {
      const data = openaiUpdateSchema.parse(req.body);
      publicConfig = {
        enabled: data.enabled ?? true,
        model: data.model ?? "gpt-4o-mini",
        maxTokens: data.maxTokens ?? 2000,
        temperature: data.temperature ?? "0.7",
      };
      if (data.apiKey) {
        secretConfig = { apiKey: data.apiKey };
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

tenantIntegrationsRouter.post("/tenants/:tenantId/integrations/:provider/test", requireSuperUser, async (req, res) => {
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
