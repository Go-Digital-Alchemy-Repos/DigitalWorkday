/**
 * Centralized AI Provider Resolver
 * 
 * Implements hierarchical OpenAI configuration:
 * 1. Tenant-specific OpenAI config (priority)
 * 2. System-level OpenAI config (fallback)
 * 3. Environment variable fallback (OPENAI_API_KEY)
 * 4. Returns null if no configuration found
 * 
 * SECURITY:
 * - API keys never exposed to client
 * - All resolution is server-side
 * - Tenant isolation enforced
 */

import { db } from "../../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { decryptValue, isEncryptionAvailable } from "../../lib/encryption";
import OpenAI from "openai";

export interface AIConfig {
  enabled: boolean;
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
}

export interface AIProviderResult {
  config: AIConfig;
  source: "tenant" | "system" | "environment";
  sourceId: string | null;
}

export class AINotConfiguredError extends Error {
  code = "AI_NOT_CONFIGURED";
  
  constructor(message?: string) {
    super(message || "AI integration has not been configured. Contact your administrator.");
    this.name = "AINotConfiguredError";
  }
}

interface OpenAIPublicConfig {
  enabled: boolean;
  model: string;
  maxTokens: number;
  temperature: string;
}

interface OpenAISecretConfig {
  apiKey: string;
}

function debugLog(message: string, data?: Record<string, any>) {
  if (process.env.AI_DEBUG === "true") {
    const safeData = data ? { ...data } : {};
    delete safeData.apiKey;
    console.log(`[AIProvider DEBUG] ${message}`, safeData);
  }
}

export class AIDecryptionError extends Error {
  code = "AI_DECRYPTION_FAILED";
  
  constructor(integrationId: string) {
    super(`Failed to decrypt AI credentials for integration ${integrationId}. Check APP_ENCRYPTION_KEY configuration.`);
    this.name = "AIDecryptionError";
  }
}

async function getIntegrationConfig(tenantId: string | null): Promise<{
  config: AIConfig | null;
  source: "tenant" | "system";
  sourceId: string | null;
}> {
  const condition = tenantId
    ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, "openai"))
    : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, "openai"));

  try {
    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

    if (!integration || integration.status !== IntegrationStatus.CONFIGURED) {
      return { config: null, source: tenantId ? "tenant" : "system", sourceId: null };
    }

    const publicConfig = integration.configPublic as OpenAIPublicConfig | null;
    if (!publicConfig?.enabled) {
      return { config: null, source: tenantId ? "tenant" : "system", sourceId: null };
    }

    if (!integration.configEncrypted || !isEncryptionAvailable()) {
      return { config: null, source: tenantId ? "tenant" : "system", sourceId: null };
    }

    try {
      const secretConfig = JSON.parse(decryptValue(integration.configEncrypted)) as OpenAISecretConfig;
      
      if (!secretConfig.apiKey) {
        return { config: null, source: tenantId ? "tenant" : "system", sourceId: null };
      }

      return {
        config: {
          enabled: publicConfig.enabled,
          model: publicConfig.model || "gpt-4o-mini",
          apiKey: secretConfig.apiKey,
          maxTokens: publicConfig.maxTokens || 2000,
          temperature: parseFloat(publicConfig.temperature || "0.7"),
        },
        source: tenantId ? "tenant" : "system",
        sourceId: integration.id,
      };
    } catch (decryptError) {
      debugLog("Failed to decrypt AI config", { tenantId, error: String(decryptError) });
      throw new AIDecryptionError(integration.id);
    }
  } catch (dbError: unknown) {
    const message = dbError instanceof Error ? dbError.message : String(dbError);
    if (message.includes("does not exist") || message.includes("column")) {
      debugLog("Database schema issue", { tenantId, error: message });
      return { config: null, source: tenantId ? "tenant" : "system", sourceId: null };
    }
    throw dbError;
  }
}

/**
 * Resolve AI configuration with hierarchical fallback:
 * 1. Tenant-specific config (if tenantId provided)
 * 2. System-level config (tenantId = NULL)
 * 3. Environment variable (OPENAI_API_KEY)
 * 4. Null if nothing configured
 */
export async function getAIProvider(tenantId: string | null): Promise<AIProviderResult | null> {
  debugLog("Resolving AI provider", { tenantId });

  // Step 1: Try tenant-specific config
  if (tenantId) {
    const tenantResult = await getIntegrationConfig(tenantId);
    if (tenantResult.config) {
      debugLog("Using tenant-specific AI config", { tenantId, sourceId: tenantResult.sourceId });
      return {
        config: tenantResult.config,
        source: "tenant",
        sourceId: tenantResult.sourceId,
      };
    }
    debugLog("No tenant-specific AI config, falling back to system", { tenantId });
  }

  // Step 2: Try system-level config
  const systemResult = await getIntegrationConfig(null);
  if (systemResult.config) {
    debugLog("Using system-level AI config", { sourceId: systemResult.sourceId });
    return {
      config: systemResult.config,
      source: "system",
      sourceId: systemResult.sourceId,
    };
  }

  // Step 3: Try environment variable fallback
  const envApiKey = process.env.OPENAI_API_KEY;
  if (envApiKey) {
    debugLog("Using environment variable OPENAI_API_KEY");
    return {
      config: {
        enabled: true,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        apiKey: envApiKey,
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "2000", 10),
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.7"),
      },
      source: "environment",
      sourceId: null,
    };
  }

  debugLog("No AI configuration found");
  return null;
}

/**
 * Get AI provider or throw error
 */
export async function getAIProviderOrThrow(tenantId: string | null): Promise<AIProviderResult> {
  const result = await getAIProvider(tenantId);
  if (!result) {
    throw new AINotConfiguredError();
  }
  return result;
}

/**
 * Check if AI is available for a tenant
 */
export async function isAIAvailable(tenantId: string | null): Promise<boolean> {
  const result = await getAIProvider(tenantId);
  return result !== null;
}

/**
 * Get OpenAI client with hierarchical config resolution
 */
export async function getOpenAIClient(tenantId: string | null): Promise<OpenAI | null> {
  const result = await getAIProvider(tenantId);
  if (!result) {
    return null;
  }
  return new OpenAI({ apiKey: result.config.apiKey });
}

/**
 * Get AI status for display in UI
 */
export async function getAIStatus(tenantId: string | null): Promise<{
  available: boolean;
  source: "tenant" | "system" | "environment" | null;
  model: string | null;
  enabled: boolean;
}> {
  const result = await getAIProvider(tenantId);
  
  if (!result) {
    return {
      available: false,
      source: null,
      model: null,
      enabled: false,
    };
  }

  return {
    available: true,
    source: result.source,
    model: result.config.model,
    enabled: result.config.enabled,
  };
}
