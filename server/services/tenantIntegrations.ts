import { db } from "../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";
import Mailgun from "mailgun.js";
import FormData from "form-data";

export type IntegrationProvider = "mailgun" | "s3" | "r2" | "openai" | "asana" | "quickbooks";

interface MailgunPublicConfig {
  domain: string;
  fromEmail: string;
  region?: "US" | "EU";
  replyTo?: string;
}

function mailgunClient(apiKey: string, region?: string) {
  const mailgun = new Mailgun(FormData);
  const opts: Record<string, string> = { username: "api", key: apiKey };
  if (region === "EU") opts.url = "https://api.eu.mailgun.net";
  return mailgun.client(opts as any);
}

interface MailgunSecretConfig {
  apiKey: string;
}

interface S3PublicConfig {
  bucketName: string;
  region: string;
  keyPrefixTemplate: string;
}

interface S3SecretConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface R2PublicConfig {
  bucketName: string;
  accountId: string;
  endpoint: string;
  keyPrefixTemplate?: string;
}

interface R2SecretConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * OpenAI integration public configuration
 */
export interface OpenAIPublicConfig {
  enabled: boolean;
  model: string;
  maxTokens: number;
  temperature: string;
}

/**
 * OpenAI integration secret configuration (encrypted)
 */
export interface OpenAISecretConfig {
  apiKey: string;
}

export interface AsanaPublicConfig {
  enabled: boolean;
  workspaceGid?: string;
  workspaceName?: string;
}

export interface AsanaSecretConfig {
  personalAccessToken: string;
}

type PublicConfig = MailgunPublicConfig | S3PublicConfig | R2PublicConfig | OpenAIPublicConfig | AsanaPublicConfig;
type SecretConfig = MailgunSecretConfig | S3SecretConfig | R2SecretConfig | OpenAISecretConfig | AsanaSecretConfig;

interface SecretMaskedInfo {
  apiKeyMasked?: string | null;
  accessKeyIdMasked?: string | null;
  secretAccessKeyMasked?: string | null;
  clientSecretMasked?: string | null;
}

export interface IntegrationResponse {
  provider: string;
  status: string;
  publicConfig: PublicConfig | null;
  secretConfigured: boolean;
  lastTestedAt: Date | null;
  secretMasked?: SecretMaskedInfo;
}

function debugLog(message: string, data?: Record<string, any>) {
  if (process.env.MAILGUN_DEBUG === "true") {
    const safeData = data ? { ...data } : {};
    delete safeData.apiKey;
    delete safeData.secretAccessKey;
    delete safeData.accessKeyId;
    console.log(`[TenantIntegrations DEBUG] ${message}`, safeData);
  }
}

function maskSecret(secret: string | undefined | null): string | null {
  if (!secret || secret.length < 4) return null;
  return "••••" + secret.slice(-4);
}

export interface IntegrationUpdateInput {
  publicConfig?: Partial<PublicConfig>;
  secretConfig?: Partial<SecretConfig>;
}

export class TenantIntegrationService {
  private _buildProviderCondition(tenantId: string | null, provider: IntegrationProvider) {
    return tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
  }

  private _decryptSecretConfig<T extends SecretConfig = SecretConfig>(configEncrypted: string | null, provider?: string): T | null {
    if (!configEncrypted || !isEncryptionAvailable()) {
      return null;
    }
    try {
      return JSON.parse(decryptValue(configEncrypted)) as T;
    } catch {
      console.error(`[TenantIntegrations] Failed to decrypt secrets${provider ? ` for ${provider}` : ""}`);
      return null;
    }
  }

  private _buildSecretMasked(provider: IntegrationProvider, secrets: SecretConfig): SecretMaskedInfo {
    if (provider === "mailgun") {
      const mgSecrets = secrets as MailgunSecretConfig;
      return { apiKeyMasked: maskSecret(mgSecrets.apiKey) };
    } else if (provider === "s3") {
      const s3Secrets = secrets as S3SecretConfig;
      return {
        accessKeyIdMasked: maskSecret(s3Secrets.accessKeyId),
        secretAccessKeyMasked: maskSecret(s3Secrets.secretAccessKey),
      };
    } else if (provider === "r2") {
      const r2Secrets = secrets as R2SecretConfig;
      return {
        accessKeyIdMasked: maskSecret(r2Secrets.accessKeyId),
        secretAccessKeyMasked: maskSecret(r2Secrets.secretAccessKey),
      };
    } else if (provider === "openai") {
      const aiSecrets = secrets as OpenAISecretConfig;
      return { apiKeyMasked: maskSecret(aiSecrets.apiKey) };
    } else if (provider === "asana") {
      const asanaSecrets = secrets as AsanaSecretConfig;
      return { apiKeyMasked: maskSecret(asanaSecrets.personalAccessToken) };
    }
    return {};
  }

  private async _fetchIntegrationRow(tenantId: string | null, provider: IntegrationProvider): Promise<typeof tenantIntegrations.$inferSelect | null> {
    const condition = this._buildProviderCondition(tenantId, provider);
    const [result] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);
    return result || null;
  }

  async getIntegration(tenantId: string | null, provider: IntegrationProvider): Promise<IntegrationResponse | null> {
    debugLog("getIntegration called", { tenantId, provider });
    
    let integration;
    try {
      integration = await this._fetchIntegrationRow(tenantId, provider);
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      if (message.includes("does not exist") || message.includes("column")) {
        console.warn("[TenantIntegrations] table/column issue:", message);
        return null;
      }
      throw dbError;
    }

    if (!integration) {
      debugLog("getIntegration - not found", { tenantId, provider });
      return null;
    }

    let secretMasked: SecretMaskedInfo | undefined;
    const secrets = this._decryptSecretConfig(integration.configEncrypted, provider);
    if (secrets) {
      secretMasked = this._buildSecretMasked(provider, secrets);
    }

    debugLog("getIntegration - found", { 
      tenantId, 
      provider, 
      status: integration.status, 
      hasSecrets: !!integration.configEncrypted 
    });

    return {
      provider: integration.provider,
      status: integration.status,
      publicConfig: integration.configPublic as PublicConfig | null,
      secretConfigured: !!integration.configEncrypted,
      lastTestedAt: integration.lastTestedAt,
      secretMasked,
    };
  }

  async listIntegrations(tenantId: string | null): Promise<IntegrationResponse[]> {
    debugLog("listIntegrations called", { tenantId });
    
    const condition = tenantId
      ? eq(tenantIntegrations.tenantId, tenantId)
      : isNull(tenantIntegrations.tenantId);
    
    let integrations: typeof tenantIntegrations.$inferSelect[] = [];
    try {
      integrations = await db
        .select()
        .from(tenantIntegrations)
        .where(condition);
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      if (message.includes("does not exist") || message.includes("column")) {
        console.warn("[TenantIntegrations] listIntegrations table/column issue:", message);
        // Return empty list with not_configured status for all providers
        return ["mailgun", "s3", "r2", "openai"].map(p => ({
          provider: p,
          status: IntegrationStatus.NOT_CONFIGURED,
          publicConfig: null,
          secretConfigured: false,
          lastTestedAt: null,
        }));
      }
      throw dbError;
    }

    const providers: IntegrationProvider[] = ["mailgun", "s3", "r2", "openai"];
    const result: IntegrationResponse[] = [];

    for (const provider of providers) {
      const existing = integrations.find(i => i.provider === provider);
      if (existing) {
        let secretMasked: SecretMaskedInfo | undefined;
        const secrets = this._decryptSecretConfig(existing.configEncrypted, provider);
        if (secrets) {
          secretMasked = this._buildSecretMasked(provider, secrets);
        }
        result.push({
          provider: existing.provider,
          status: existing.status,
          publicConfig: existing.configPublic as PublicConfig | null,
          secretConfigured: !!existing.configEncrypted,
          lastTestedAt: existing.lastTestedAt,
          secretMasked,
        });
      } else {
        result.push({
          provider,
          status: IntegrationStatus.NOT_CONFIGURED,
          publicConfig: null,
          secretConfigured: false,
          lastTestedAt: null,
        });
      }
    }

    debugLog("listIntegrations - complete", { tenantId, count: result.length });
    return result;
  }

  async upsertIntegration(
    tenantId: string | null,
    provider: IntegrationProvider,
    input: IntegrationUpdateInput
  ): Promise<IntegrationResponse> {
    debugLog("upsertIntegration called", { 
      tenantId, 
      provider, 
      hasPublicConfig: !!input.publicConfig,
      hasSecretConfig: !!input.secretConfig 
    });

    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      debugLog("upsertIntegration - ENCRYPTION_KEY_MISSING", { tenantId, provider });
      throw new Error("Encryption key not configured. Cannot save integration secrets.");
    }

    const existing = await this._fetchIntegrationRow(tenantId, provider);

    let publicConfig: PublicConfig | null = null;
    let configEncrypted: string | null = null;
    let hasSecret = false;

    if (existing) {
      publicConfig = (existing.configPublic as PublicConfig) || null;
      if (existing.configEncrypted) {
        try {
          configEncrypted = existing.configEncrypted;
          hasSecret = true;
        } catch {
          configEncrypted = null;
        }
      }
    }

    if (input.publicConfig) {
      publicConfig = {
        ...(publicConfig || {}),
        ...input.publicConfig,
      } as PublicConfig;
    }

    if (input.secretConfig) {
      const hasNewSecret = Object.values(input.secretConfig).some(v => v && v.trim() !== "");
      if (hasNewSecret) {
        const existingSecrets: SecretConfig = this._decryptSecretConfig(configEncrypted, provider) ?? {};
        const newSecrets: SecretConfig = {
          ...existingSecrets,
          ...input.secretConfig,
        };
        Object.keys(newSecrets).forEach(key => {
          if ((newSecrets as any)[key] === "" || (newSecrets as any)[key] === undefined) {
            delete (newSecrets as any)[key];
          }
        });
        if (Object.keys(newSecrets).length > 0) {
          configEncrypted = encryptValue(JSON.stringify(newSecrets));
          hasSecret = true;
        }
      }
    }

    const status = this.determineStatus(provider, publicConfig, hasSecret);

    if (existing) {
      await db
        .update(tenantIntegrations)
        .set({
          configPublic: publicConfig,
          configEncrypted,
          status,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrations.id, existing.id));
      debugLog("upsertIntegration - updated existing", { tenantId, provider, status, savedOk: true });
    } else {
      await db.insert(tenantIntegrations).values({
        tenantId,
        provider,
        configPublic: publicConfig,
        configEncrypted,
        status,
      });
      debugLog("upsertIntegration - inserted new", { tenantId, provider, status, savedOk: true });
    }

    return {
      provider,
      status,
      publicConfig,
      secretConfigured: hasSecret,
      lastTestedAt: existing?.lastTestedAt || null,
    };
  }

  async getDecryptedSecrets<T extends SecretConfig = SecretConfig>(tenantId: string | null, provider: IntegrationProvider): Promise<T | null> {
    const integration = await this._fetchIntegrationRow(tenantId, provider);
    return this._decryptSecretConfig<T>(integration?.configEncrypted ?? null, provider);
  }

  async getIntegrationWithSecrets(tenantId: string | null, provider: IntegrationProvider): Promise<{ publicConfig: PublicConfig | null; secretConfig: SecretConfig | null } | null> {
    const integration = await this._fetchIntegrationRow(tenantId, provider);
    if (!integration) {
      return null;
    }
    return {
      publicConfig: integration.configPublic as PublicConfig | null,
      secretConfig: this._decryptSecretConfig(integration.configEncrypted, provider),
    };
  }

  async getIntegrationDetailedSecrets<T extends SecretConfig = SecretConfig>(
    tenantId: string | null,
    provider: IntegrationProvider,
  ): Promise<{
    id: string;
    status: string;
    publicConfig: PublicConfig | null;
    secretConfig: T | null;
    hasEncryptedData: boolean;
    encryptionAvailable: boolean;
  } | null> {
    const integration = await this._fetchIntegrationRow(tenantId, provider);
    if (!integration) {
      return null;
    }
    const hasEncryptedData = !!integration.configEncrypted;
    const encryptionAvailable = isEncryptionAvailable();
    return {
      id: integration.id,
      status: integration.status,
      publicConfig: integration.configPublic as PublicConfig | null,
      secretConfig: this._decryptSecretConfig<T>(integration.configEncrypted, provider),
      hasEncryptedData,
      encryptionAvailable,
    };
  }

  async testIntegration(tenantId: string | null, provider: IntegrationProvider): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, provider);
    
    if (!integration) {
      return { success: false, message: `${provider} is not configured` };
    }

    // For OpenAI: allow test even with stale NOT_CONFIGURED status as long as a secret exists.
    // The test will update the status to CONFIGURED on success (self-healing).
    const isOpenAIWithSecret = provider === "openai" && integration.secretConfigured;

    if (!isOpenAIWithSecret && integration.status === IntegrationStatus.NOT_CONFIGURED) {
      return { success: false, message: `${provider} is not configured` };
    }

    try {
      let testResult: { success: boolean; message: string };

      switch (provider) {
        case "mailgun":
          testResult = await this.testMailgun(tenantId);
          break;
        case "s3":
          testResult = await this.testS3(tenantId);
          break;
        case "r2":
          testResult = await this.testR2(tenantId);
          break;
        case "openai":
          testResult = await this.testOpenAI(tenantId);
          break;
        default:
          testResult = { success: false, message: `Unknown provider: ${provider}` };
      }

      const updateCondition = this._buildProviderCondition(tenantId, provider);
      
      await db
        .update(tenantIntegrations)
        .set({
          lastTestedAt: new Date(),
          status: testResult.success ? IntegrationStatus.CONFIGURED : IntegrationStatus.ERROR,
          updatedAt: new Date(),
        })
        .where(updateCondition);

      return testResult;
    } catch (error) {
      console.error(`[TenantIntegrations] Test failed for ${provider}:`, error);
      
      const updateCondition = this._buildProviderCondition(tenantId, provider);
      
      await db
        .update(tenantIntegrations)
        .set({
          lastTestedAt: new Date(),
          status: IntegrationStatus.ERROR,
          updatedAt: new Date(),
        })
        .where(updateCondition);

      return { success: false, message: error instanceof Error ? error.message : "Test failed" };
    }
  }

  private async testMailgun(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const secrets = await this.getDecryptedSecrets(tenantId, "mailgun") as MailgunSecretConfig | null;
    const integration = await this.getIntegration(tenantId, "mailgun");
    
    if (!secrets?.apiKey || !integration?.publicConfig) {
      return { success: false, message: "Mailgun API key not configured" };
    }

    const config = integration.publicConfig as MailgunPublicConfig;
    if (!config.domain || !config.fromEmail) {
      return { success: false, message: "Mailgun domain or from email not configured" };
    }

    try {
      const mg = mailgunClient(secrets.apiKey, config.region);
      await mg.domains.get(config.domain);
      debugLog("testMailgun - domain validated", { tenantId, domain: config.domain, region: config.region });
      return { success: true, message: "Mailgun configuration is valid" };
    } catch (error: any) {
      debugLog("testMailgun - failed", { tenantId, error: error.message });
      return { success: false, message: error.message || "Failed to validate Mailgun domain" };
    }
  }

  async sendTestEmail(
    tenantId: string,
    toEmail: string,
    tenantName: string,
    requestId: string
  ): Promise<{ ok: boolean; error?: { code: string; message: string; requestId: string } }> {
    debugLog("sendTestEmail called", { tenantId, toEmail, requestId });

    const integration = await this.getIntegration(tenantId, "mailgun");
    if (!integration || integration.status !== IntegrationStatus.CONFIGURED) {
      return {
        ok: false,
        error: {
          code: "MAILGUN_NOT_CONFIGURED",
          message: "Mailgun is not configured for this tenant",
          requestId,
        },
      };
    }

    const secrets = await this.getDecryptedSecrets(tenantId, "mailgun") as MailgunSecretConfig | null;
    if (!secrets?.apiKey) {
      return {
        ok: false,
        error: {
          code: "MAILGUN_API_KEY_MISSING",
          message: "Mailgun API key is not configured",
          requestId,
        },
      };
    }

    const config = integration.publicConfig as MailgunPublicConfig;

    try {
      const mg = mailgunClient(secrets.apiKey, config.region);

      const timestamp = new Date().toISOString();
      await mg.messages.create(config.domain, {
        from: config.fromEmail,
        to: [toEmail],
        subject: "Mailgun Test - Digital Workday",
        text: `This is a test email from Digital Workday.\n\nTenant: ${tenantName}\nTimestamp: ${timestamp}\nRequest ID: ${requestId}\n\nIf you received this email, your Mailgun integration is working correctly.`,
      });

      debugLog("sendTestEmail - success", { tenantId, toEmail, requestId });
      return { ok: true };
    } catch (error: any) {
      debugLog("sendTestEmail - failed", { tenantId, error: error.message, requestId });
      return {
        ok: false,
        error: {
          code: "MAILGUN_SEND_FAILED",
          message: error.message || "Failed to send test email",
          requestId,
        },
      };
    }
  }

  private async testS3(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "s3");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "S3 bucket not configured" };
    }

    const config = integration.publicConfig as S3PublicConfig;
    if (!config.bucketName || !config.region) {
      return { success: false, message: "S3 bucket or region not configured" };
    }

    const label = tenantId ? `tenant ${tenantId}` : "system-level";
    console.log(`[S3] Testing integration for ${label} - bucket: ${config.bucketName}`);
    return { success: true, message: "S3 configuration is valid" };
  }

  private async testR2(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "r2");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "Cloudflare R2 not configured" };
    }

    const config = integration.publicConfig as R2PublicConfig;
    if (!config.bucketName || !config.accountId) {
      return { success: false, message: "R2 bucket or account ID not configured" };
    }

    const label = tenantId ? `tenant ${tenantId}` : "system-level";
    console.log(`[R2] Testing integration for ${label} - bucket: ${config.bucketName}, accountId: ${config.accountId}`);
    return { success: true, message: "Cloudflare R2 configuration is valid" };
  }

  private determineStatus(
    provider: IntegrationProvider,
    publicConfig: PublicConfig | null,
    hasSecret: boolean
  ): string {
    if (!publicConfig) {
      return IntegrationStatus.NOT_CONFIGURED;
    }

    switch (provider) {
      case "mailgun": {
        const config = publicConfig as MailgunPublicConfig;
        if (config.domain && config.fromEmail && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "s3": {
        const config = publicConfig as S3PublicConfig;
        // S3 requires bucketName, region, AND secrets (accessKeyId, secretAccessKey)
        if (config.bucketName && config.region && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "r2": {
        const config = publicConfig as R2PublicConfig;
        if (config.bucketName && config.accountId && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "openai": {
        const config = publicConfig as OpenAIPublicConfig;
        if (config.enabled && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "asana": {
        const config = publicConfig as AsanaPublicConfig;
        if (config.enabled && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
    }

    return IntegrationStatus.NOT_CONFIGURED;
  }

  private async testOpenAI(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "openai");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "OpenAI is not configured" };
    }

    const config = integration.publicConfig as OpenAIPublicConfig;
    if (!config.enabled) {
      return { success: false, message: "OpenAI integration is disabled" };
    }

    const secrets = await this.getDecryptedSecrets(tenantId, "openai") as OpenAISecretConfig | null;
    if (!secrets?.apiKey) {
      return { success: false, message: "OpenAI API key is required" };
    }

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: secrets.apiKey });
      
      const response = await client.chat.completions.create({
        model: config.model || "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 10,
      });

      if (response.choices && response.choices.length > 0) {
        return { success: true, message: `OpenAI connection successful (model: ${response.model})` };
      }
      return { success: false, message: "No response from OpenAI API" };
    } catch (error: any) {
      console.error("[OpenAI] Test failed:", error);
      return { success: false, message: error.message || "Failed to connect to OpenAI API" };
    }
  }

  async clearSecret(tenantId: string | null, provider: IntegrationProvider, secretName: string): Promise<void> {
    const integration = await this._fetchIntegrationRow(tenantId, provider);

    if (!integration || !integration.configEncrypted) {
      return;
    }

    try {
      const secrets = JSON.parse(decryptValue(integration.configEncrypted)) as SecretConfig;
      delete (secrets as any)[secretName];
      
      const hasRemainingSecrets = Object.keys(secrets).some(key => !!(secrets as any)[key]);
      const configEncrypted = hasRemainingSecrets ? encryptValue(JSON.stringify(secrets)) : null;
      const status = this.determineStatus(provider, integration.configPublic as PublicConfig, hasRemainingSecrets);

      await db
        .update(tenantIntegrations)
        .set({
          configEncrypted,
          status,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrations.id, integration.id));

      debugLog("clearSecret - completed", { tenantId, provider, secretName });
    } catch (err) {
      console.error(`[TenantIntegrations] Failed to clear secret ${secretName} for ${provider}:`, err);
      throw err;
    }
  }

}

export const tenantIntegrationService = new TenantIntegrationService();
