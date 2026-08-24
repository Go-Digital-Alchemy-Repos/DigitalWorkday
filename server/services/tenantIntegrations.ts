import { db } from "../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";
import { externalFetch } from "../lib/fetchWithTimeout";
import Mailgun from "mailgun.js";
import FormData from "form-data";

export type IntegrationProvider = "mailgun" | "s3" | "r2" | "openai" | "asana" | "quickbooks" | "wpengine";

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
  region?: string;
  keyPrefixTemplate?: string;
  publicUrl?: string;
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

export interface QuickBooksPublicConfig {
  enabled: boolean;
  environment: "sandbox" | "production";
  clientId?: string;
  realmId?: string | null;
  companyName?: string | null;
  connectedAt?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  scope?: string | null;
}

export interface QuickBooksSecretConfig {
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface WPEnginePublicConfig {
  enabled: boolean;
  apiUsername?: string;
  accountName?: string | null;
}

export interface WPEngineSecretConfig {
  apiPassword?: string;
}

type PublicConfig = MailgunPublicConfig | S3PublicConfig | R2PublicConfig | OpenAIPublicConfig | AsanaPublicConfig | QuickBooksPublicConfig | WPEnginePublicConfig;
type SecretConfig = MailgunSecretConfig | S3SecretConfig | R2SecretConfig | OpenAISecretConfig | AsanaSecretConfig | QuickBooksSecretConfig | WPEngineSecretConfig;

interface SecretMaskedInfo {
  apiKeyMasked?: string | null;
  accessKeyIdMasked?: string | null;
  secretAccessKeyMasked?: string | null;
  clientSecretMasked?: string | null;
  refreshTokenMasked?: string | null;
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

interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
}

function getQuickBooksApiBaseUrl(environment: QuickBooksPublicConfig["environment"] | undefined): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function refreshQuickBooksToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<QuickBooksTokenResponse> {
  const response = await externalFetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`QuickBooks token refresh failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return JSON.parse(text) as QuickBooksTokenResponse;
}

export interface QuickBooksInvoiceLine {
  itemId: string | null;
  itemName: string | null;
  description: string | null;
  amount: number;
}

export interface QuickBooksInvoiceSummary {
  id: string;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  totalAmount: number;
  balance: number;
  customerId: string | null;
  customerName: string | null;
  lines: QuickBooksInvoiceLine[];
}

const WPENGINE_API_BASE_URL = "https://api.wpengineapi.com/v1";

export interface WPEngineInstallSummary {
  id: string;
  name: string | null;
  environment: string | null;
  primaryDomain: string | null;
  cname: string | null;
  phpVersion: string | null;
  status: string | null;
  siteName: string | null;
  // WP Engine "accounts" are the physical servers/plans; a dedicated customer
  // often has its own account (e.g. da4sunstoppers), which makes the account
  // name a strong ownership signal.
  accountId: string | null;
  accountName: string | null;
}

export interface IntegrationUpdateInput {
  publicConfig?: Partial<PublicConfig>;
  secretConfig?: Partial<SecretConfig>;
}

export class TenantIntegrationService {
  async getIntegration(tenantId: string | null, provider: IntegrationProvider): Promise<IntegrationResponse | null> {
    debugLog("getIntegration called", { tenantId, provider });
    
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
    
    let integration;
    try {
      const [result] = await db
        .select()
        .from(tenantIntegrations)
        .where(condition)
        .limit(1);
      integration = result;
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
    if (integration.configEncrypted && isEncryptionAvailable()) {
      try {
        const secrets = JSON.parse(decryptValue(integration.configEncrypted)) as SecretConfig;
        if (provider === "mailgun") {
          const mgSecrets = secrets as MailgunSecretConfig;
          secretMasked = {
            apiKeyMasked: maskSecret(mgSecrets.apiKey),
          };
        } else if (provider === "s3") {
          const s3Secrets = secrets as S3SecretConfig;
          secretMasked = {
            accessKeyIdMasked: maskSecret(s3Secrets.accessKeyId),
            secretAccessKeyMasked: maskSecret(s3Secrets.secretAccessKey),
          };
        } else if (provider === "r2") {
          const r2Secrets = secrets as R2SecretConfig;
          secretMasked = {
            accessKeyIdMasked: maskSecret(r2Secrets.accessKeyId),
            secretAccessKeyMasked: maskSecret(r2Secrets.secretAccessKey),
          };
        } else if (provider === "openai") {
          const aiSecrets = secrets as OpenAISecretConfig;
          secretMasked = {
            apiKeyMasked: maskSecret(aiSecrets.apiKey),
          };
        } else if (provider === "asana") {
          const asanaSecrets = secrets as AsanaSecretConfig;
          secretMasked = {
            apiKeyMasked: maskSecret(asanaSecrets.personalAccessToken),
          };
        } else if (provider === "quickbooks") {
          const qbSecrets = secrets as QuickBooksSecretConfig;
          secretMasked = {
            clientSecretMasked: maskSecret(qbSecrets.clientSecret),
            refreshTokenMasked: maskSecret(qbSecrets.refreshToken),
          };
        } else if (provider === "wpengine") {
          const wpSecrets = secrets as WPEngineSecretConfig;
          secretMasked = {
            apiKeyMasked: maskSecret(wpSecrets.apiPassword),
          };
        }
      } catch (err) {
        debugLog("getIntegration - failed to decrypt secrets for masking", { tenantId, provider });
      }
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
        return ["mailgun", "s3", "r2", "openai", "quickbooks", "wpengine"].map(p => ({
          provider: p,
          status: IntegrationStatus.NOT_CONFIGURED,
          publicConfig: null,
          secretConfigured: false,
          lastTestedAt: null,
        }));
      }
      throw dbError;
    }

    const providers: IntegrationProvider[] = ["mailgun", "s3", "r2", "openai", "quickbooks", "wpengine"];
    const result: IntegrationResponse[] = [];

    for (const provider of providers) {
      const existing = integrations.find(i => i.provider === provider);
      if (existing) {
        let secretMasked: SecretMaskedInfo | undefined;
        if (existing.configEncrypted && isEncryptionAvailable()) {
          try {
            const secrets = JSON.parse(decryptValue(existing.configEncrypted)) as SecretConfig;
            if (provider === "mailgun") {
              const mgSecrets = secrets as MailgunSecretConfig;
              secretMasked = { apiKeyMasked: maskSecret(mgSecrets.apiKey) };
            } else if (provider === "s3") {
              const s3Secrets = secrets as S3SecretConfig;
              secretMasked = {
                accessKeyIdMasked: maskSecret(s3Secrets.accessKeyId),
                secretAccessKeyMasked: maskSecret(s3Secrets.secretAccessKey),
              };
            } else if (provider === "openai") {
              const aiSecrets = secrets as OpenAISecretConfig;
              secretMasked = { apiKeyMasked: maskSecret(aiSecrets.apiKey) };
            } else if (provider === "quickbooks") {
              const qbSecrets = secrets as QuickBooksSecretConfig;
              secretMasked = {
                clientSecretMasked: maskSecret(qbSecrets.clientSecret),
                refreshTokenMasked: maskSecret(qbSecrets.refreshToken),
              };
            } else if (provider === "wpengine") {
              const wpSecrets = secrets as WPEngineSecretConfig;
              secretMasked = { apiKeyMasked: maskSecret(wpSecrets.apiPassword) };
            }
          } catch {
            debugLog("listIntegrations - failed to decrypt secrets for masking", { tenantId, provider });
          }
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

    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));

    const [existing] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

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
        let existingSecrets: SecretConfig = {};
        if (configEncrypted && isEncryptionAvailable()) {
          try {
            existingSecrets = JSON.parse(decryptValue(configEncrypted));
          } catch {
            existingSecrets = {};
          }
        }
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

  async getDecryptedSecrets(tenantId: string | null, provider: IntegrationProvider): Promise<SecretConfig | null> {
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
    
    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

    if (!integration?.configEncrypted) {
      return null;
    }

    try {
      return JSON.parse(decryptValue(integration.configEncrypted));
    } catch {
      console.error(`[TenantIntegrations] Failed to decrypt secrets for ${provider}`);
      return null;
    }
  }

  async getIntegrationWithSecrets(tenantId: string | null, provider: IntegrationProvider): Promise<{ publicConfig: PublicConfig | null; secretConfig: SecretConfig | null } | null> {
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
    
    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

    if (!integration) {
      return null;
    }

    let secretConfig: SecretConfig | null = null;
    if (integration.configEncrypted) {
      try {
        secretConfig = JSON.parse(decryptValue(integration.configEncrypted));
      } catch {
        console.error(`[TenantIntegrations] Failed to decrypt secrets for ${provider}`);
      }
    }

    return {
      publicConfig: integration.configPublic as PublicConfig | null,
      secretConfig,
    };
  }

  async testIntegration(tenantId: string | null, provider: IntegrationProvider): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, provider);
    
    if (!integration || integration.status === IntegrationStatus.NOT_CONFIGURED) {
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
        case "quickbooks":
          testResult = await this.testQuickBooks(tenantId);
          break;
        case "wpengine":
          testResult = await this.testWPEngine(tenantId);
          break;
        default:
          testResult = { success: false, message: `Unknown provider: ${provider}` };
      }

      const updateCondition = tenantId
        ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
        : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
      
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
      
      const updateCondition = tenantId
        ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
        : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
      
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
        subject: "Mailgun Test - MyWorkDay",
        text: `This is a test email from MyWorkDay.\n\nTenant: ${tenantName}\nTimestamp: ${timestamp}\nRequest ID: ${requestId}\n\nIf you received this email, your Mailgun integration is working correctly.`,
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
        // R2 requires bucketName, accountId, AND secrets (accessKeyId, secretAccessKey)
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
      case "quickbooks": {
        const config = publicConfig as QuickBooksPublicConfig;
        if (config.enabled && config.clientId && config.realmId && config.connectedAt && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "wpengine": {
        const config = publicConfig as WPEnginePublicConfig;
        if (config.enabled && config.apiUsername && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
    }

    return IntegrationStatus.NOT_CONFIGURED;
  }

  /**
   * Returns a valid QuickBooks access token plus API context, refreshing and
   * persisting tokens when the stored access token is missing or near expiry.
   * Throws when QuickBooks is not configured/connected for the tenant.
   */
  private async getQuickBooksAccessContext(tenantId: string | null): Promise<{
    accessToken: string;
    baseUrl: string;
    realmId: string;
  }> {
    const integration = await this.getIntegration(tenantId, "quickbooks");
    const secrets = await this.getDecryptedSecrets(tenantId, "quickbooks") as QuickBooksSecretConfig | null;

    if (!integration?.publicConfig) {
      throw new Error("QuickBooks is not configured");
    }
    const config = integration.publicConfig as QuickBooksPublicConfig;
    if (!config.enabled) {
      throw new Error("QuickBooks integration is disabled");
    }
    if (!config.clientId || !secrets?.clientSecret) {
      throw new Error("QuickBooks client ID and client secret are required");
    }
    if (!config.realmId || !secrets?.refreshToken) {
      throw new Error("QuickBooks is not connected yet");
    }

    const baseUrl = getQuickBooksApiBaseUrl(config.environment);
    const expiresAt = config.accessTokenExpiresAt ? Date.parse(config.accessTokenExpiresAt) : 0;
    const isTokenFresh = Boolean(secrets.accessToken) && expiresAt - Date.now() > 120_000;
    if (isTokenFresh) {
      return { accessToken: secrets.accessToken!, baseUrl, realmId: config.realmId };
    }

    const tokenResult = await refreshQuickBooksToken(config.clientId, secrets.clientSecret, secrets.refreshToken);
    const accessToken = tokenResult.access_token;
    const now = Date.now();
    await this.upsertIntegration(tenantId, "quickbooks", {
      publicConfig: {
        accessTokenExpiresAt: new Date(now + (tokenResult.expires_in || 3600) * 1000).toISOString(),
        refreshTokenExpiresAt: tokenResult.x_refresh_token_expires_in
          ? new Date(now + tokenResult.x_refresh_token_expires_in * 1000).toISOString()
          : config.refreshTokenExpiresAt,
      },
      secretConfig: {
        accessToken,
        refreshToken: tokenResult.refresh_token || secrets.refreshToken,
      },
    });

    return { accessToken, baseUrl, realmId: config.realmId };
  }

  /**
   * Fetches invoices from the connected QuickBooks company, newest first.
   * `sinceDate` is an ISO date (YYYY-MM-DD) lower bound on TxnDate.
   */
  async fetchQuickBooksInvoices(tenantId: string | null, sinceDate: string): Promise<QuickBooksInvoiceSummary[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
      throw new Error(`Invalid sinceDate: ${sinceDate}`);
    }
    const { accessToken, baseUrl, realmId } = await this.getQuickBooksAccessContext(tenantId);

    const pageSize = 1000;
    const maxPages = 20;
    const invoices: QuickBooksInvoiceSummary[] = [];

    for (let page = 0; page < maxPages; page++) {
      const startPosition = page * pageSize + 1;
      const query = `SELECT * FROM Invoice WHERE TxnDate >= '${sinceDate}' ORDERBY TxnDate DESC STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
      const response = await externalFetch(
        `${baseUrl}/v3/company/${encodeURIComponent(realmId)}/query?query=${encodeURIComponent(query)}&minorversion=75`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`QuickBooks invoice query failed (${response.status}): ${body.slice(0, 180)}`);
      }

      const body = await response.json();
      const rows: any[] = body?.QueryResponse?.Invoice || [];
      for (const row of rows) {
        const lines: QuickBooksInvoiceLine[] = [];
        for (const line of row.Line || []) {
          const detail = line.SalesItemLineDetail;
          if (!detail) continue;
          lines.push({
            itemId: detail.ItemRef?.value ?? null,
            itemName: detail.ItemRef?.name ?? null,
            description: line.Description ?? null,
            amount: Number(line.Amount) || 0,
          });
        }
        invoices.push({
          id: String(row.Id),
          docNumber: row.DocNumber ?? null,
          txnDate: row.TxnDate,
          dueDate: row.DueDate ?? null,
          totalAmount: Number(row.TotalAmt) || 0,
          balance: Number(row.Balance) || 0,
          customerId: row.CustomerRef?.value ?? null,
          customerName: row.CustomerRef?.name ?? null,
          lines,
        });
      }

      if (rows.length < pageSize) break;
    }

    return invoices;
  }

  private async testQuickBooks(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "quickbooks");
    const secrets = await this.getDecryptedSecrets(tenantId, "quickbooks") as QuickBooksSecretConfig | null;

    if (!integration?.publicConfig) {
      return { success: false, message: "QuickBooks is not configured" };
    }

    const config = integration.publicConfig as QuickBooksPublicConfig;
    if (!config.enabled) {
      return { success: false, message: "QuickBooks integration is disabled" };
    }
    if (!config.clientId || !secrets?.clientSecret) {
      return { success: false, message: "QuickBooks client ID and client secret are required" };
    }
    if (!config.realmId || !secrets?.refreshToken) {
      return { success: false, message: "QuickBooks is not connected yet" };
    }

    const tokenResult = await refreshQuickBooksToken(config.clientId, secrets.clientSecret, secrets.refreshToken);
    const accessToken = tokenResult.access_token;
    const refreshToken = tokenResult.refresh_token || secrets.refreshToken;
    const now = Date.now();

    await this.upsertIntegration(tenantId, "quickbooks", {
      publicConfig: {
        accessTokenExpiresAt: new Date(now + (tokenResult.expires_in || 3600) * 1000).toISOString(),
        refreshTokenExpiresAt: tokenResult.x_refresh_token_expires_in
          ? new Date(now + tokenResult.x_refresh_token_expires_in * 1000).toISOString()
          : config.refreshTokenExpiresAt,
      },
      secretConfig: {
        accessToken,
        refreshToken,
      },
    });

    const baseUrl = getQuickBooksApiBaseUrl(config.environment);
    const companyResponse = await externalFetch(
      `${baseUrl}/v3/company/${encodeURIComponent(config.realmId)}/companyinfo/${encodeURIComponent(config.realmId)}?minorversion=75`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );

    if (!companyResponse.ok) {
      const body = await companyResponse.text();
      return {
        success: false,
        message: `QuickBooks token refreshed, but company check failed (${companyResponse.status}): ${body.slice(0, 160)}`,
      };
    }

    let companyName = "connected company";
    try {
      const body = await companyResponse.json();
      companyName = body?.CompanyInfo?.CompanyName || companyName;
      await this.upsertIntegration(tenantId, "quickbooks", {
        publicConfig: { companyName },
      });
    } catch {
      // The successful status is enough for a connection test.
    }

    return { success: true, message: `QuickBooks connection successful (${companyName})` };
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

  /**
   * Resolves the WP Engine Basic auth header for a tenant, throwing when the
   * integration is not configured, disabled, or missing credentials.
   */
  private async getWPEngineAuthHeader(tenantId: string | null): Promise<string> {
    const integration = await this.getIntegration(tenantId, "wpengine");
    if (!integration?.publicConfig) {
      throw new Error("WP Engine is not configured");
    }

    const config = integration.publicConfig as WPEnginePublicConfig;
    if (!config.enabled) {
      throw new Error("WP Engine integration is disabled");
    }
    if (!config.apiUsername) {
      throw new Error("WP Engine API username is required");
    }

    const secrets = await this.getDecryptedSecrets(tenantId, "wpengine") as WPEngineSecretConfig | null;
    if (!secrets?.apiPassword) {
      throw new Error("WP Engine API password is required");
    }

    return `Basic ${Buffer.from(`${config.apiUsername}:${secrets.apiPassword}`).toString("base64")}`;
  }

  private async testWPEngine(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    let authHeader: string;
    try {
      authHeader = await this.getWPEngineAuthHeader(tenantId);
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "WP Engine is not configured" };
    }

    const response = await externalFetch(`${WPENGINE_API_BASE_URL}/installs?limit=1`, {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
    });

    if (response.status === 401) {
      return { success: false, message: "WP Engine rejected the request (401); check API credentials" };
    }
    if (!response.ok) {
      const body = await response.text();
      return { success: false, message: `WP Engine API check failed (${response.status}): ${body.slice(0, 160)}` };
    }

    let installCount: number | null = null;
    try {
      const body = await response.json();
      if (typeof body?.count === "number") {
        installCount = body.count;
      } else if (Array.isArray(body?.results)) {
        installCount = body.results.length;
      }
    } catch {
      // A successful status is enough for a connection test.
    }

    return {
      success: true,
      message: installCount !== null
        ? `WP Engine connection successful (${installCount} install${installCount === 1 ? "" : "s"})`
        : "WP Engine connection successful",
    };
  }

  /**
   * Pages through a WP Engine collection endpoint (GET-only).
   */
  private async listWPEngineResources(authHeader: string, resource: "installs" | "accounts" | "sites"): Promise<any[]> {
    const pageSize = 100;
    const maxPages = 20;
    const rowsOut: any[] = [];
    let nextUrl: string | null = `${WPENGINE_API_BASE_URL}/${resource}?limit=${pageSize}`;

    for (let page = 0; page < maxPages && nextUrl; page++) {
      const response = await externalFetch(nextUrl, {
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
      });

      if (response.status === 401) {
        throw new Error("WP Engine rejected the request (401); check API credentials");
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`WP Engine ${resource} listing failed (${response.status}): ${body.slice(0, 160)}`);
      }

      const body = await response.json();
      const rows: any[] = Array.isArray(body?.results) ? body.results : [];
      rowsOut.push(...rows);

      // Only follow next links that stay on the WP Engine API host.
      nextUrl = typeof body?.next === "string" && body.next.startsWith(WPENGINE_API_BASE_URL) ? body.next : null;
      if (!nextUrl && rows.length === pageSize) {
        // Some responses omit the next link; fall back to offset paging.
        nextUrl = `${WPENGINE_API_BASE_URL}/${resource}?limit=${pageSize}&offset=${(page + 1) * pageSize}`;
      }
      if (rows.length < pageSize) break;
    }

    return rowsOut;
  }

  /**
   * Lists all WordPress installs across the WP Engine accounts visible to the
   * configured API user (GET-only). Install payloads only carry account/site
   * ids, so the human-readable names are joined from /accounts and /sites.
   */
  async listWPEngineInstalls(tenantId: string | null): Promise<WPEngineInstallSummary[]> {
    const authHeader = await this.getWPEngineAuthHeader(tenantId);

    const [installRows, accountRows, siteRows] = await Promise.all([
      this.listWPEngineResources(authHeader, "installs"),
      this.listWPEngineResources(authHeader, "accounts"),
      this.listWPEngineResources(authHeader, "sites"),
    ]);

    const accountNames = new Map<string, string>();
    for (const account of accountRows) {
      if (account?.id && account?.name) accountNames.set(String(account.id), String(account.name));
    }
    const siteNames = new Map<string, string>();
    for (const site of siteRows) {
      if (site?.id && site?.name) siteNames.set(String(site.id), String(site.name));
    }

    const installs: WPEngineInstallSummary[] = [];
    for (const install of installRows) {
      if (!install?.id) continue;
      const accountId = install.account?.id ? String(install.account.id) : null;
      const siteId = install.site?.id ? String(install.site.id) : null;
      installs.push({
        id: String(install.id),
        name: install.name ?? null,
        environment: install.environment ?? null,
        primaryDomain: install.primary_domain ?? null,
        cname: install.cname ?? null,
        phpVersion: install.php_version ?? null,
        status: install.status ?? null,
        siteName: (siteId && siteNames.get(siteId)) || null,
        accountId,
        accountName: (accountId && accountNames.get(accountId)) || null,
      });
    }

    return installs;
  }

  async clearSecret(tenantId: string | null, provider: IntegrationProvider, secretName: string): Promise<void> {
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));

    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

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
