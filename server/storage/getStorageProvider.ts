/**
 * Centralized Storage Provider Resolver
 * 
 * Implements hierarchical S3 configuration:
 * 1. Tenant-specific S3 config (priority)
 * 2. System-level S3 config (fallback)
 * 3. Throws STORAGE_NOT_CONFIGURED if neither exists
 * 
 * SECURITY:
 * - S3 credentials never exposed to client
 * - All resolution is server-side
 * - Tenant isolation enforced
 */

import { db } from "../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { decryptValue, isEncryptionAvailable } from "../lib/encryption";
import { S3Client } from "@aws-sdk/client-s3";

export interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefixTemplate?: string;
}

export interface StorageProviderResult {
  config: S3Config;
  source: "tenant" | "system";
  sourceId: string | null;
}

export class StorageNotConfiguredError extends Error {
  code = "STORAGE_NOT_CONFIGURED";
  
  constructor(message?: string) {
    super(message || "File storage has not been configured. Contact your administrator.");
    this.name = "StorageNotConfiguredError";
  }
}

interface S3PublicConfig {
  bucketName: string;
  region: string;
  keyPrefixTemplate?: string;
}

interface S3SecretConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
}

function debugLog(message: string, data?: Record<string, any>) {
  if (process.env.S3_STORAGE_DEBUG === "true") {
    const safeData = data ? { ...data } : {};
    delete safeData.accessKeyId;
    delete safeData.secretAccessKey;
    console.log(`[StorageProvider DEBUG] ${message}`, safeData);
  }
}

async function getIntegrationConfig(tenantId: string | null, provider: string = "s3"): Promise<{
  publicConfig: S3PublicConfig | null;
  secretConfig: S3SecretConfig | null;
  integrationId: string;
} | null> {
  const condition = tenantId 
    ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider), eq(tenantIntegrations.status, IntegrationStatus.CONFIGURED))
    : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider), eq(tenantIntegrations.status, IntegrationStatus.CONFIGURED));

  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(condition)
    .limit(1);

  if (!integration) {
    return null;
  }

  let secretConfig: S3SecretConfig | null = null;
  if (integration.configEncrypted && isEncryptionAvailable()) {
    try {
      secretConfig = JSON.parse(decryptValue(integration.configEncrypted)) as S3SecretConfig;
    } catch (err) {
      console.error(`[StorageProvider] Failed to decrypt secrets for integration ${integration.id}`);
      return null;
    }
  }

  return {
    publicConfig: integration.configPublic as S3PublicConfig | null,
    secretConfig,
    integrationId: integration.id,
  };
}

function isValidS3Config(publicConfig: S3PublicConfig | null, secretConfig: S3SecretConfig | null): boolean {
  if (!publicConfig?.bucketName || !publicConfig?.region) {
    return false;
  }
  if (!secretConfig?.accessKeyId || !secretConfig?.secretAccessKey) {
    return false;
  }
  return true;
}

/**
 * Get the S3 storage provider configuration for a tenant.
 * 
 * Resolution order:
 * 1. Tenant-specific S3 integration (if tenantId provided)
 * 2. System-level S3 integration (tenantId = NULL)
 * 3. Environment variables (legacy fallback)
 * 4. Throws StorageNotConfiguredError if none available
 * 
 * @param tenantId - The tenant ID to resolve storage for, or null for system-level only
 * @returns StorageProviderResult with config and source information
 * @throws StorageNotConfiguredError if no storage is configured
 */
export async function getStorageProvider(tenantId: string | null): Promise<StorageProviderResult> {
  debugLog("Resolving storage provider", { tenantId });

  if (tenantId) {
    const tenantConfig = await getIntegrationConfig(tenantId, "s3");
    if (tenantConfig && isValidS3Config(tenantConfig.publicConfig, tenantConfig.secretConfig)) {
      debugLog("Using tenant S3 configuration", { tenantId, integrationId: tenantConfig.integrationId });
      return {
        config: {
          bucketName: tenantConfig.publicConfig!.bucketName,
          region: tenantConfig.publicConfig!.region,
          accessKeyId: tenantConfig.secretConfig!.accessKeyId!,
          secretAccessKey: tenantConfig.secretConfig!.secretAccessKey!,
          keyPrefixTemplate: tenantConfig.publicConfig!.keyPrefixTemplate,
        },
        source: "tenant",
        sourceId: tenantId,
      };
    }
    debugLog("No valid tenant S3 config, checking system fallback", { tenantId });
  }

  const systemConfig = await getIntegrationConfig(null, "s3");
  if (systemConfig && isValidS3Config(systemConfig.publicConfig, systemConfig.secretConfig)) {
    debugLog("Using system S3 configuration (fallback)", { tenantId });
    return {
      config: {
        bucketName: systemConfig.publicConfig!.bucketName,
        region: systemConfig.publicConfig!.region,
        accessKeyId: systemConfig.secretConfig!.accessKeyId!,
        secretAccessKey: systemConfig.secretConfig!.secretAccessKey!,
        keyPrefixTemplate: systemConfig.publicConfig!.keyPrefixTemplate,
      },
      source: "system",
      sourceId: null,
    };
  }

  const envRegion = process.env.AWS_REGION;
  const envAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const envSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const envBucketName = process.env.AWS_S3_BUCKET_NAME;

  if (envRegion && envAccessKeyId && envSecretAccessKey && envBucketName) {
    debugLog("Using environment variable S3 configuration (legacy)", { tenantId });
    return {
      config: {
        bucketName: envBucketName,
        region: envRegion,
        accessKeyId: envAccessKeyId,
        secretAccessKey: envSecretAccessKey,
        keyPrefixTemplate: process.env.AWS_S3_KEY_PREFIX,
      },
      source: "system",
      sourceId: null,
    };
  }

  debugLog("No storage provider configured", { tenantId });
  throw new StorageNotConfiguredError();
}

/**
 * Create an S3Client from the resolved storage provider configuration.
 */
export function createS3ClientFromConfig(config: S3Config): S3Client {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Check the storage status for a tenant (for UI display).
 * Returns information about which storage source is being used.
 */
export async function getStorageStatus(tenantId: string | null): Promise<{
  configured: boolean;
  source: "tenant" | "system" | "env" | "none";
  tenantHasOverride: boolean;
  systemHasDefault: boolean;
}> {
  let tenantHasOverride = false;
  let systemHasDefault = false;

  if (tenantId) {
    const tenantConfig = await getIntegrationConfig(tenantId, "s3");
    tenantHasOverride = tenantConfig !== null && isValidS3Config(tenantConfig.publicConfig, tenantConfig.secretConfig);
  }

  const systemConfig = await getIntegrationConfig(null, "s3");
  systemHasDefault = systemConfig !== null && isValidS3Config(systemConfig.publicConfig, systemConfig.secretConfig);

  const envConfigured = !!(
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET_NAME
  );

  let source: "tenant" | "system" | "env" | "none" = "none";
  let configured = false;

  if (tenantHasOverride) {
    source = "tenant";
    configured = true;
  } else if (systemHasDefault) {
    source = "system";
    configured = true;
  } else if (envConfigured) {
    source = "env";
    configured = true;
  }

  return {
    configured,
    source,
    tenantHasOverride,
    systemHasDefault,
  };
}
