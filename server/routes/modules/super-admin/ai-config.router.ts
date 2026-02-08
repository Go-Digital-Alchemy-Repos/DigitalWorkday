import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { systemSettings } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { encryptApiKey, testAIConnection, getAIConfigStatus } from '../../../services/ai/aiService';
import { recordTenantAuditEvent } from '../../superAdmin';

export const aiConfigRouter = Router();

aiConfigRouter.get("/ai/config", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1));
    
    const configStatus = await getAIConfigStatus();
    
    res.json({
      enabled: settings?.aiEnabled || false,
      provider: settings?.aiProvider || "openai",
      model: settings?.aiModel || "gpt-4o-mini",
      maxTokens: settings?.aiMaxTokens || 2000,
      temperature: settings?.aiTemperature || "0.7",
      hasApiKey: !!settings?.aiApiKeyEncrypted,
      apiKeyMasked: settings?.aiApiKeyEncrypted ? "••••••••" + settings.aiApiKeyEncrypted.slice(-4) : null,
      lastTestedAt: settings?.aiLastTestedAt || null,
      configError: configStatus.error || null,
      isOperational: configStatus.config !== null,
    });
  } catch (error) {
    console.error("[AI] Failed to get AI config:", error);
    res.status(500).json({ error: "Failed to get AI configuration" });
  }
});

const updateAIConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  maxTokens: z.number().min(100).max(8000).optional(),
  temperature: z.string().optional(),
});

aiConfigRouter.put("/ai/config", requireSuperUser, async (req, res) => {
  try {
    const parsed = updateAIConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const { enabled, provider, model, apiKey, maxTokens, temperature } = parsed.data;
    
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    
    if (enabled !== undefined) updateData.aiEnabled = enabled;
    if (provider !== undefined) updateData.aiProvider = provider;
    if (model !== undefined) updateData.aiModel = model;
    if (maxTokens !== undefined) updateData.aiMaxTokens = maxTokens;
    if (temperature !== undefined) updateData.aiTemperature = temperature;
    
    if (apiKey && apiKey.trim()) {
      updateData.aiApiKeyEncrypted = encryptApiKey(apiKey.trim());
    }
    
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1));
    
    if (existing) {
      await db.update(systemSettings)
        .set(updateData)
        .where(eq(systemSettings.id, 1));
    } else {
      await db.insert(systemSettings).values({
        id: 1,
        ...updateData,
      });
    }
    
    const superUser = req.user!;
    await recordTenantAuditEvent(
      null,
      "ai_config_updated",
      `AI configuration updated by ${superUser?.email}`,
      superUser?.id,
      { enabled, provider, model }
    );
    
    res.json({ success: true, message: "AI configuration updated" });
  } catch (error) {
    console.error("[AI] Failed to update AI config:", error);
    res.status(500).json({ error: "Failed to update AI configuration" });
  }
});

aiConfigRouter.post("/ai/test", requireSuperUser, async (req, res) => {
  try {
    const result = await testAIConnection();
    
    if (result.success) {
      await db.update(systemSettings)
        .set({ aiLastTestedAt: new Date() })
        .where(eq(systemSettings.id, 1));
    }
    
    res.json(result);
  } catch (error: any) {
    console.error("[AI] Connection test failed:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to test AI connection" 
    });
  }
});

aiConfigRouter.delete("/ai/api-key", requireSuperUser, async (req, res) => {
  try {
    await db.update(systemSettings)
      .set({ 
        aiApiKeyEncrypted: null, 
        aiEnabled: false,
        updatedAt: new Date() 
      })
      .where(eq(systemSettings.id, 1));
    
    const superUser = req.user!;
    await recordTenantAuditEvent(
      null,
      "ai_api_key_removed",
      `AI API key removed by ${superUser?.email}`,
      superUser?.id,
      {}
    );
    
    res.json({ success: true, message: "AI API key removed" });
  } catch (error) {
    console.error("[AI] Failed to remove API key:", error);
    res.status(500).json({ error: "Failed to remove API key" });
  }
});
