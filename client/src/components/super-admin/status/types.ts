export interface HealthCheck {
  database: { status: "healthy" | "unhealthy" | "unknown"; latencyMs?: number };
  websocket: { status: "healthy" | "unhealthy" | "unknown"; connections?: number };
  s3: { status: "healthy" | "unhealthy" | "not_configured" };
  mailgun: { status: "healthy" | "unhealthy" | "not_configured" };
  app: { version?: string; uptime?: number; environment?: string };
}

export interface TenancyHealth {
  currentMode: string;
  totalMissing: number;
  totalQuarantined: number;
  activeTenantCount: number;
  missingByTable: Record<string, number>;
  quarantinedByTable: Record<string, number>;
  hasQuarantineTenant: boolean;
  warningStats: {
    last24Hours: number;
    last7Days: number;
    total: number;
  };
}

export interface QuarantineSummary {
  hasQuarantineTenant: boolean;
  quarantineTenantId?: string;
  counts: Record<string, number>;
  message?: string;
}

export interface QuarantineListResponse {
  rows: any[];
  total: number;
  page: number;
  limit: number;
  table: string;
}

export interface TenantIdScan {
  missing: Record<string, number>;
  totalMissing: number;
  quarantineTenantId: string | null;
  backfillAllowed: boolean;
  notes: string[];
}

export interface BackfillResult {
  mode: string;
  updated: Record<string, number>;
  quarantined: Record<string, number>;
  ambiguousSamples: Record<string, string[]>;
  quarantineTenantId?: string;
}

export interface IntegrityIssue {
  code: string;
  severity: "info" | "warn" | "blocker";
  count: number;
  sampleIds: string[];
  description: string;
}

export interface IntegrityChecksResponse {
  issues: IntegrityIssue[];
  totalIssues: number;
  blockerCount: number;
  warnCount: number;
  infoCount: number;
  timestamp: string;
}

export interface DebugConfig {
  flags: {
    SUPER_DEBUG_DELETE_ALLOWED: boolean;
    SUPER_DEBUG_ACTIONS_ALLOWED: boolean;
    BACKFILL_TENANT_IDS_ALLOWED: boolean;
    TENANCY_ENFORCEMENT: string;
  };
  confirmPhrases: Record<string, string>;
}

export interface OrphanTableResult {
  table: string;
  count: number;
  sampleIds: Array<{ id: string; display: string }>;
  recommendedAction: string;
}

export interface OrphanDetectionResult {
  totalOrphans: number;
  tablesWithOrphans: number;
  tables: OrphanTableResult[];
  quarantineTenant: {
    id?: string;
    name?: string;
    exists: boolean;
  };
}

export interface OrphanFixResult {
  dryRun: boolean;
  quarantineTenantId: string | null;
  quarantineCreated: boolean;
  totalFixed: number;
  totalWouldFix: number;
  results: Array<{
    table: string;
    action: string;
    countBefore: number;
    countFixed: number;
    targetTenantId: string | null;
  }>;
}

export interface ChatDebugStatus {
  enabled: boolean;
  envVar: string;
}

export interface ChatDebugMetrics {
  activeSockets: number;
  roomsJoined: number;
  messagesLast5Min: number;
  disconnectsLast5Min: number;
  lastErrors: Array<{ code: string; count: number; lastOccurred: string }>;
}

export interface ChatDebugEvent {
  id: string;
  timestamp: string;
  eventType: string;
  socketId?: string;
  requestId?: string;
  userId?: string;
  tenantId?: string;
  conversationId?: string;
  roomName?: string;
  payloadSize?: number;
  disconnectReason?: string;
  errorCode?: string;
}

export interface ChatDebugSocket {
  socketId: string;
  userId?: string;
  tenantId?: string;
  connectedAt: string;
  roomsCount: number;
}

export interface ErrorLogEntry {
  id: string;
  requestId: string;
  tenantId: string | null;
  userId: string | null;
  method: string;
  path: string;
  status: number;
  errorName: string | null;
  message: string;
  stack: string | null;
  dbCode: string | null;
  dbConstraint: string | null;
  meta: Record<string, unknown> | null;
  environment: string | null;
  resolved: boolean | null;
  createdAt: string;
}

export interface ErrorLogsResponse {
  ok: boolean;
  requestId: string;
  logs: ErrorLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface DbIntrospectTable {
  name: string;
  exists: boolean;
  columns: string[];
  missingColumns: string[];
}

export interface DbIntrospectCheck {
  check: string;
  ok: boolean;
}

export interface DbIntrospectResponse {
  generatedAt: string;
  database: {
    hostHint: string;
    nameHint: string;
  };
  tables: DbIntrospectTable[];
  requiredChecks: DbIntrospectCheck[];
  summary: {
    totalTables: number;
    checkedTables: number;
    passedChecks: number;
    failedChecks: number;
    hasSchemaDrift: boolean;
  };
}

export interface RepairProposedUpdate {
  table: string;
  id: string;
  currentTenantId: string | null;
  derivedTenantId: string;
  confidence: "high" | "low";
  derivation: string;
  notes?: string;
}

export interface RepairPreviewResult {
  proposedUpdates: RepairProposedUpdate[];
  highConfidenceCount: number;
  lowConfidenceCount: number;
  byTable: Record<string, { high: number; low: number }>;
}

export interface RepairApplyResult {
  updatedCountByTable: Record<string, number>;
  skippedLowConfidenceCountByTable: Record<string, number>;
  sampleUpdatedIds: string[];
  totalUpdated: number;
  totalSkipped: number;
}

export interface GlobalHealthSummary {
  totalTenants: number;
  readyTenants: number;
  blockedTenants: number;
  totalOrphanRows: number;
  byTable: Record<string, number>;
}

export interface TenantPickerItem {
  id: string;
  name: string;
  status: string;
}

export interface AuthDiagnosticsData {
  authType: string;
  overallStatus: "healthy" | "warning" | "error";
  cookies: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "none" | "strict";
    domainConfigured: boolean;
    maxAgeDays: number;
  };
  cors: {
    credentialsEnabled: boolean;
    allowedOriginConfigured: boolean;
  };
  proxy: {
    trustProxyEnabled: boolean;
  };
  session: {
    enabled: boolean;
    storeType: "memory" | "pg" | "redis" | "none";
    secretConfigured: boolean;
  };
  runtime: {
    nodeEnv: string;
    isRailway: boolean;
    databaseConfigured: boolean;
  };
  issues: string[];
  warnings: string[];
  commonFixes: Array<{ condition: string; tip: string }>;
  lastAuthCheck: string;
}

export interface StatusSummary {
  ok: boolean;
  requestId: string;
  timestamp: string;
  checks: {
    db: {
      status: "ok" | "failed";
      latencyMs: number;
      error?: string;
    };
    migrations: {
      version: string | null;
      available: boolean;
    };
    s3: {
      configured: boolean;
      presign: "ok" | "failed" | "not_tested";
      error?: string;
    };
    mailgun: {
      configured: boolean;
    };
    auth: {
      cookieSecure: boolean;
      cookieHttpOnly: boolean;
      cookieSameSite: string;
      trustProxy: boolean;
      sessionSecretSet: boolean;
      environment: string;
    };
    orphanCounts: {
      totalMissing: number;
      totalQuarantined: number;
      byTable: Record<string, number>;
      error?: string;
    };
  };
}

export interface SuperEmailLog {
  id: string;
  tenantId: string | null;
  messageType: string;
  toEmail: string;
  subject: string;
  status: string;
  providerMessageId: string | null;
  lastError: string | null;
  requestId: string | null;
  resendCount: number | null;
  createdAt: string;
}

export interface SuperEmailStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  last24Hours: number;
  last7Days: number;
}
