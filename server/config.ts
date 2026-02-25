/**
 * Centralized Configuration Module
 * 
 * Purpose: Read and validate all environment variables at startup.
 * 
 * Behavior:
 * - In production (NODE_ENV=production): Fails fast if critical vars are missing
 * - In development: Uses safe defaults for optional vars, warns about missing ones
 * 
 * Sharp Edges:
 * - Import this module early in server startup to catch config issues immediately
 * - Never log actual secret values - only log whether they are configured
 */

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = !isProduction;

// ============================================================================
// Configuration Value Helpers
// ============================================================================

function requireEnv(key: string, reason: string): string {
  const value = process.env[key];
  if (!value) {
    if (isProduction) {
      throw new Error(
        `FATAL: ${key} environment variable is required in production. ${reason}`
      );
    }
    console.warn(`[config] WARNING: ${key} is not set - ${reason}`);
    return "";
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function optionalEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function optionalEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================================================
// Core Configuration (Required in Production)
// ============================================================================

export const config = {
  // Environment
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  isProduction,
  isDevelopment,
  
  // Server
  port: optionalEnvInt("PORT", 5000),
  host: "0.0.0.0",
  
  // Database (CRITICAL - required in production)
  databaseUrl: (() => {
    const url = process.env.DATABASE_URL;
    if (!url && isProduction) {
      throw new Error(
        "FATAL: DATABASE_URL environment variable is required in production. " +
        "The application cannot function without a database connection."
      );
    }
    if (!url) {
      console.warn("[config] WARNING: DATABASE_URL is not set - database operations will fail");
    }
    return url || "";
  })(),
  
  // Session (CRITICAL - required in production)
  sessionSecret: (() => {
    const secret = process.env.SESSION_SECRET;
    if (!secret && isProduction) {
      throw new Error(
        "FATAL: SESSION_SECRET environment variable is required in production. " +
        "Sessions cannot be securely encrypted without it. " +
        "Set SESSION_SECRET to a strong random string (minimum 32 characters)."
      );
    }
    if (!secret) {
      console.warn("[config] WARNING: SESSION_SECRET not set - using insecure dev fallback");
    }
    return secret || "dasana-dev-secret-key";
  })(),
  
  // Startup behavior
  autoMigrate: optionalEnvBool("AUTO_MIGRATE", false),
  fastStartup: optionalEnvBool("FAST_STARTUP", false),
  skipParityCheck: optionalEnvBool("SKIP_PARITY_CHECK", false),
  failOnSchemaIssues: optionalEnvBool("FAIL_ON_SCHEMA_ISSUES", true),
  
  // Rate Limiting
  rateLimiting: {
    enabled: optionalEnvBool("RATE_LIMIT_ENABLED", true),
    devEnabled: optionalEnvBool("RATE_LIMIT_DEV_ENABLED", false),
    debug: optionalEnvBool("RATE_LIMIT_DEBUG", false),
    loginWindowMs: optionalEnvInt("RATE_LIMIT_LOGIN_WINDOW_MS", 60000),
    loginMaxIp: optionalEnvInt("RATE_LIMIT_LOGIN_MAX_IP", 10),
    loginMaxEmail: optionalEnvInt("RATE_LIMIT_LOGIN_MAX_EMAIL", 5),
    bootstrapWindowMs: optionalEnvInt("RATE_LIMIT_BOOTSTRAP_WINDOW_MS", 60000),
    bootstrapMaxIp: optionalEnvInt("RATE_LIMIT_BOOTSTRAP_MAX_IP", 5),
    inviteWindowMs: optionalEnvInt("RATE_LIMIT_INVITE_WINDOW_MS", 60000),
    inviteMaxIp: optionalEnvInt("RATE_LIMIT_INVITE_MAX_IP", 10),
    forgotPasswordWindowMs: optionalEnvInt("RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS", 60000),
    forgotPasswordMaxIp: optionalEnvInt("RATE_LIMIT_FORGOT_PASSWORD_MAX_IP", 5),
    forgotPasswordMaxEmail: optionalEnvInt("RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL", 3),
    uploadWindowMs: optionalEnvInt("RATE_LIMIT_UPLOAD_WINDOW_MS", 60000),
    uploadMaxIp: optionalEnvInt("RATE_LIMIT_UPLOAD_MAX_IP", 30),
  },
  
  // Cloudflare R2 Storage (optional - system can use tenant-level config)
  r2: {
    accountId: process.env.CF_R2_ACCOUNT_ID || "",
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.CF_R2_BUCKET_NAME || "",
    publicUrl: process.env.CF_R2_PUBLIC_URL || "",
    isConfigured: !!(
      process.env.CF_R2_ACCOUNT_ID &&
      process.env.CF_R2_ACCESS_KEY_ID &&
      process.env.CF_R2_SECRET_ACCESS_KEY &&
      process.env.CF_R2_BUCKET_NAME
    ),
  },
  
  // Mailgun (optional - email features disabled if not set)
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY || "",
    domain: process.env.MAILGUN_DOMAIN || "",
    fromEmail: process.env.MAILGUN_FROM_EMAIL || "",
    isConfigured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    debug: optionalEnvBool("MAILGUN_DEBUG", false),
  },
  
  // Stripe (optional - billing features disabled if not set)
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    isConfigured: !!process.env.STRIPE_SECRET_KEY,
  },
  
  // OpenAI (optional - AI features disabled if not set)
  openai: {
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
    isConfigured: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
  },
  
  // CRM & Client Portal Feature Flags (all default OFF)
  crm: {
    client360Enabled: optionalEnvBool("CRM_CLIENT_360_ENABLED", false),
    contactsEnabled: optionalEnvBool("CRM_CONTACTS_ENABLED", false),
    timelineEnabled: optionalEnvBool("CRM_TIMELINE_ENABLED", false),
    portalEnabled: optionalEnvBool("CRM_PORTAL_ENABLED", false),
    filesEnabled: optionalEnvBool("CRM_FILES_ENABLED", false),
    approvalsEnabled: optionalEnvBool("CRM_APPROVALS_ENABLED", false),
    clientMessagingEnabled: optionalEnvBool("CRM_CLIENT_MESSAGING_ENABLED", false),
  },

  // Client Workspace Migration Feature Flags (all default OFF)
  features: {
    assetLibraryV2: optionalEnvBool("ASSET_LIBRARY_V2", false),
    clientWorkspaceV2: optionalEnvBool("CLIENT_WORKSPACE_V2", false),
    documentsUsingAssets: optionalEnvBool("DOCUMENTS_USING_ASSETS", false),
    clientProfileLayoutV2: optionalEnvBool("CLIENT_PROFILE_LAYOUT_V2", true),
    clientCommandPaletteV1: optionalEnvBool("CLIENT_COMMAND_PALETTE_V1", true),
    clientControlCenterPremium: optionalEnvBool("CLIENT_CONTROL_CENTER_PREMIUM", true),
    clientControlCenterPinnedWidgets: optionalEnvBool("CLIENT_CONTROL_CENTER_PINNED_WIDGETS", true),
    notificationsGroupingV1: optionalEnvBool("NOTIFICATIONS_GROUPING_V1", true),
    prefetchV1: optionalEnvBool("PREFETCH_V1", true),
    virtualizationV1: optionalEnvBool("VIRTUALIZATION_V1", true),
    tenantDefaultDocs: optionalEnvBool("TENANT_DEFAULT_DOCS", true),
    // Reporting Engine V2 — stable, ON by default in all environments
    reportingEngineEnabled: optionalEnvBool("REPORTING_ENGINE", true),
    reportWorkloadV2: optionalEnvBool("REPORT_WORKLOAD_V2", true),
    reportTaskAnalysisV2: optionalEnvBool("REPORT_TASK_ANALYSIS_V2", false),
    reportClientAnalyticsV2: optionalEnvBool("REPORT_CLIENT_ANALYTICS_V2", false),
    reportTimeTrackingV2: optionalEnvBool("REPORT_TIME_TRACKING_V2", false),
    reportProjectAnalysisV2: optionalEnvBool("REPORT_PROJECT_ANALYSIS_V2", false),
    reportMessagesV2: optionalEnvBool("REPORT_MESSAGES_V2", false),
    reportPipelineV2: optionalEnvBool("REPORT_PIPELINE_V2", false),
    enableEmployeeCommandCenter: optionalEnvBool("ENABLE_EMPLOYEE_COMMAND_CENTER", true),
    enableClientCommandCenter: optionalEnvBool("ENABLE_CLIENT_COMMAND_CENTER", true),
    enableEmployeePerformanceIndex: optionalEnvBool("ENABLE_EMPLOYEE_PERFORMANCE_INDEX", true),
    enableClientHealthIndex: optionalEnvBool("ENABLE_CLIENT_HEALTH_INDEX", true),
    enableForecastingLayer: optionalEnvBool("ENABLE_FORECASTING_LAYER", true),
    enableForecastingAlerts: optionalEnvBool("ENABLE_FORECASTING_ALERTS", false),
    enableForecastSnapshots: optionalEnvBool("ENABLE_FORECAST_SNAPSHOTS", true),
    enableAlertAutomation: optionalEnvBool("ENABLE_ALERT_AUTOMATION", true),
    enableWeeklyOpsDigest: optionalEnvBool("ENABLE_WEEKLY_OPS_DIGEST", true),
    // Performance optimization flags (server-side only)
    enableTasksBatchHydration: optionalEnvBool("ENABLE_TASKS_BATCH_HYDRATION", true),
    enableClientsBatchExpansion: optionalEnvBool("ENABLE_CLIENTS_BATCH_EXPANSION", true),
    enableProjectsSqlFiltering: optionalEnvBool("ENABLE_PROJECTS_SQL_FILTERING", true),
    enablePrivateTasks: optionalEnvBool("ENABLE_PRIVATE_TASKS", true),
    enablePrivateProjects: optionalEnvBool("ENABLE_PRIVATE_PROJECTS", true),
    // Observability & stability flags
    enableObservability: optionalEnvBool("ENABLE_OBSERVABILITY", true),
    enablePerfProfiling: optionalEnvBool("ENABLE_PERF_PROFILING", false),
    enableDbPoolMetrics: optionalEnvBool("ENABLE_DB_POOL_METRICS", true),
    enablePayloadGuards: optionalEnvBool("ENABLE_PAYLOAD_GUARDS", true),
    enableRegressionSmokeTests: optionalEnvBool("ENABLE_REGRESSION_SMOKE_TESTS", false),
    enableHealthEndpoints: optionalEnvBool("ENABLE_HEALTH_ENDPOINTS", true),
    enableLogSampling: optionalEnvBool("ENABLE_LOG_SAMPLING", true),
    enableErrorReporting: optionalEnvBool("ENABLE_ERROR_REPORTING", true),
    // Data retention flags
    enableDataRetention: optionalEnvBool("ENABLE_DATA_RETENTION", false),
    enableSoftArchive: optionalEnvBool("ENABLE_SOFT_ARCHIVE", false),
    enableRetentionAuditUi: optionalEnvBool("ENABLE_RETENTION_AUDIT_UI", true),
  },

  tenancyEnforcement: {
    mode: (() => {
      const envVal = process.env.TENANCY_ENFORCEMENT;
      if (envVal) return envVal.toLowerCase() as "off" | "soft" | "strict";
      return isProduction ? "off" : "strict";
    })(),
  },

  // Git info for versioning
  git: {
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "unknown",
    branch: process.env.RAILWAY_GIT_BRANCH || process.env.GIT_BRANCH || "unknown",
  },
} as const;

// ============================================================================
// Validation Results (for health checks and diagnostics)
// ============================================================================

export interface ConfigValidationResult {
  isValid: boolean;
  criticalMissing: string[];
  optionalMissing: string[];
  warnings: string[];
}

export function validateConfig(): ConfigValidationResult {
  const criticalMissing: string[] = [];
  const optionalMissing: string[] = [];
  const warnings: string[] = [];
  
  // Critical vars
  if (!config.databaseUrl) criticalMissing.push("DATABASE_URL");
  if (!config.sessionSecret || config.sessionSecret === "dasana-dev-secret-key") {
    if (isProduction) {
      criticalMissing.push("SESSION_SECRET");
    } else {
      warnings.push("SESSION_SECRET not set - using insecure dev fallback");
    }
  }
  
  // Optional but recommended
  if (!config.r2.isConfigured) {
    optionalMissing.push("Cloudflare R2 (CF_R2_*)");
    warnings.push("File uploads will use fallback or tenant-level R2 config");
  }
  
  if (!config.mailgun.isConfigured) {
    optionalMissing.push("Mailgun (MAILGUN_API_KEY, MAILGUN_DOMAIN)");
    warnings.push("Email sending is disabled");
  }
  
  if (!config.stripe.isConfigured) {
    optionalMissing.push("Stripe (STRIPE_SECRET_KEY)");
    warnings.push("Billing features are disabled");
  }
  
  return {
    isValid: criticalMissing.length === 0,
    criticalMissing,
    optionalMissing,
    warnings,
  };
}

// ============================================================================
// Startup Logging
// ============================================================================

export function logConfigStatus(): void {
  console.log(`[config] Environment: ${config.nodeEnv}`);
  console.log(`[config] Database: ${config.databaseUrl ? "configured" : "NOT CONFIGURED"}`);
  console.log(`[config] Session Secret: ${config.sessionSecret !== "dasana-dev-secret-key" ? "configured" : "using dev fallback"}`);
  console.log(`[config] Auto Migrate: ${config.autoMigrate}`);
  console.log(`[config] Fast Startup: ${config.fastStartup}`);
  console.log(`[config] R2 Storage: ${config.r2.isConfigured ? "configured" : "not configured"}`);
  console.log(`[config] Mailgun: ${config.mailgun.isConfigured ? "configured" : "disabled"}`);
  console.log(`[config] Stripe: ${config.stripe.isConfigured ? "configured" : "disabled"}`);
  console.log(`[config] Rate Limiting: ${config.rateLimiting.enabled ? "enabled" : "disabled"}`);
}

// Run validation on import to fail fast in production
if (isProduction) {
  const validation = validateConfig();
  if (!validation.isValid) {
    console.error("[config] FATAL: Missing critical environment variables:");
    validation.criticalMissing.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }
}

// Validate Stripe env vars (placeholder rejection, startup warnings)
try {
  const { validateStripeEnvAtStartup } = require("./config/stripe");
  validateStripeEnvAtStartup();
} catch (err: any) {
  if (err?.code === "STRIPE_CONFIG_ERROR" && isProduction) {
    console.error(`[config] ${err.message}`);
    process.exit(1);
  }
  if (err?.code === "STRIPE_CONFIG_ERROR") {
    console.warn(`[config] ${err.message}`);
  }
}
