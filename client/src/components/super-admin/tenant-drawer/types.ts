import type { Tenant } from "@shared/schema";

export interface TenantSettings {
  displayName?: string;
  appName?: string | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  loginMessage?: string | null;
  supportEmail?: string | null;
  whiteLabelEnabled?: boolean;
  hideVendorBranding?: boolean;
}

export interface TenantWithDetails extends Tenant {
  settings?: TenantSettings | null;
  userCount?: number;
  primaryWorkspaceId?: string;
  primaryWorkspace?: {
    id: string;
    name: string;
  };
}

export interface Workspace {
  id: string;
  name: string;
  tenantId: string | null;
  isPrimary: boolean | null;
}

export interface TenantNote {
  id: string;
  tenantId: string;
  authorUserId: string;
  lastEditedByUserId?: string | null;
  body: string;
  category: string;
  createdAt: string;
  updatedAt?: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  versionCount?: number;
  hasVersions?: boolean;
}

export interface TenantAuditEvent {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  eventType: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface TenantHealth {
  tenantId: string;
  status: string;
  primaryWorkspaceExists: boolean;
  primaryWorkspace: Workspace | null;
  users: {
    total: number;
    byRole: Record<string, number>;
  };
  agreement: {
    hasActiveAgreement: boolean;
    version: number | null;
    title: string | null;
  };
  integrations: {
    mailgunConfigured: boolean;
  };
  branding: {
    displayName: string | null;
    whiteLabelEnabled: boolean;
    logoConfigured: boolean;
  };
  warnings: string[];
  canEnableStrict: boolean;
}

export interface TenantClient {
  id: string;
  tenantId: string;
  workspaceId: string;
  companyName: string;
  displayName?: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  status: string;
  createdAt: string;
}

export interface TenantProject {
  id: string;
  tenantId: string;
  workspaceId: string;
  clientId?: string;
  name: string;
  description?: string;
  status: string;
  color?: string;
  createdAt: string;
  clientName?: string;
}

export interface TenantUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
}

export type IntegrationStatus = "not_configured" | "configured" | "error";

export interface IntegrationSummary {
  provider: string;
  status: IntegrationStatus;
  secretConfigured: boolean;
  lastTestedAt: string | null;
}

export interface MailgunConfig {
  domain?: string;
  fromEmail?: string;
  replyTo?: string;
  apiKey?: string;
}

export interface S3Config {
  bucketName?: string;
  region?: string;
  keyPrefixTemplate?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface OnboardingProgress {
  workspace: boolean;
  branding: boolean;
  email: boolean;
  users: boolean;
  activated: boolean;
}

export interface FixTenantIdsResult {
  message: string;
  fixed: number;
  tenantId: string;
  tenantName: string;
}

export interface FixClientTenantIdsResult {
  success: boolean;
  fixed: number;
  errors: number;
  fixedClients: { id: string; companyName: string; action: string }[];
  errorDetails: { id: string; companyName: string; error: string }[];
  message: string;
}

export interface SystemSettings {
  id: number;
  defaultAppName: string | null;
  defaultLogoUrl: string | null;
  defaultIconUrl: string | null;
  defaultFaviconUrl: string | null;
}
