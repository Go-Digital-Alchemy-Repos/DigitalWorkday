import { db } from "../../db";
import { tenantIntegrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { encryptValue, decryptValue } from "../../lib/encryption";

const QBO_AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

interface QuickBooksTokens {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  expires_at: number;
  token_type: string;
}

interface QuickBooksPublicConfig {
  realmId: string;
  companyName?: string;
  connectedAt: string;
}

function getClientCredentials() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("QuickBooks OAuth not configured: missing QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, or QUICKBOOKS_REDIRECT_URI");
  }
  return { clientId, clientSecret, redirectUri };
}

function getBaseUrl(): string {
  return process.env.QUICKBOOKS_API_BASE_URL || "https://quickbooks.api.intuit.com";
}

export function generateAuthUrl(tenantId: string): string {
  const { clientId, redirectUri } = getClientCredentials();
  const state = Buffer.from(JSON.stringify({ tenantId })).toString("base64url");
  const scopes = "com.intuit.quickbooks.accounting";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state,
  });
  return `${QBO_AUTH_BASE}?${params.toString()}`;
}

export async function handleOAuthCallback(code: string, realmId: string, tenantId: string, userId: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getClientCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`QuickBooks token exchange failed: ${err}`);
  }

  const data = await response.json() as any;
  const tokens: QuickBooksTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    realm_id: realmId,
    expires_at: Date.now() + (data.expires_in * 1000),
    token_type: data.token_type || "bearer",
  };

  await storeTokens(tenantId, tokens, userId);
}

async function storeTokens(tenantId: string, tokens: QuickBooksTokens, _userId?: string): Promise<void> {
  const secretData = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_at,
    tokenType: tokens.token_type,
  };
  const publicConfig: QuickBooksPublicConfig = {
    realmId: tokens.realm_id,
    connectedAt: new Date().toISOString(),
  };

  const configEncrypted = encryptValue(JSON.stringify(secretData));

  const existing = await db.select()
    .from(tenantIntegrations)
    .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, "quickbooks")))
    .limit(1);

  if (existing.length > 0) {
    await db.update(tenantIntegrations)
      .set({
        configEncrypted,
        configPublic: publicConfig,
        status: "configured",
        updatedAt: new Date(),
      })
      .where(eq(tenantIntegrations.id, existing[0].id));
  } else {
    await db.insert(tenantIntegrations).values({
      tenantId,
      provider: "quickbooks",
      configEncrypted,
      configPublic: publicConfig,
      status: "configured",
    });
  }
}

export async function getStoredTokens(tenantId: string): Promise<QuickBooksTokens | null> {
  const [integration] = await db.select()
    .from(tenantIntegrations)
    .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, "quickbooks")))
    .limit(1);

  if (!integration?.configEncrypted) return null;

  try {
    const secrets = JSON.parse(decryptValue(integration.configEncrypted));
    const publicConfig = integration.configPublic as QuickBooksPublicConfig | null;
    return {
      access_token: secrets.accessToken,
      refresh_token: secrets.refreshToken,
      realm_id: publicConfig?.realmId || "",
      expires_at: secrets.expiresAt,
      token_type: secrets.tokenType || "bearer",
    };
  } catch {
    return null;
  }
}

export async function refreshAccessToken(tenantId: string): Promise<QuickBooksTokens> {
  const tokens = await getStoredTokens(tenantId);
  if (!tokens) throw new Error("No QuickBooks connection found for this tenant");

  const { clientId, clientSecret } = getClientCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    await db.update(tenantIntegrations)
      .set({ status: "error", updatedAt: new Date() })
      .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, "quickbooks")));
    throw new Error(`QuickBooks token refresh failed: ${err}`);
  }

  const data = await response.json() as any;
  const newTokens: QuickBooksTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    realm_id: tokens.realm_id,
    expires_at: Date.now() + (data.expires_in * 1000),
    token_type: data.token_type || "bearer",
  };

  await storeTokens(tenantId, newTokens);
  return newTokens;
}

export async function disconnectQuickBooks(tenantId: string): Promise<void> {
  const tokens = await getStoredTokens(tenantId);
  if (tokens) {
    try {
      const { clientId, clientSecret } = getClientCredentials();
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ token: tokens.refresh_token }),
      });
    } catch {
      // Best-effort revocation
    }
  }

  await db.update(tenantIntegrations)
    .set({
      configEncrypted: null,
      configPublic: null,
      status: "not_configured",
      updatedAt: new Date(),
    })
    .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, "quickbooks")));
}

export async function getConnectionStatus(tenantId: string): Promise<{
  connected: boolean;
  realmId?: string;
  companyName?: string;
  connectedAt?: string;
  tokenExpired?: boolean;
}> {
  const [integration] = await db.select()
    .from(tenantIntegrations)
    .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, "quickbooks")))
    .limit(1);

  if (!integration || integration.status !== "configured") {
    return { connected: false };
  }

  const publicConfig = integration.configPublic as QuickBooksPublicConfig | null;
  let tokenExpired = false;
  try {
    const tokens = await getStoredTokens(tenantId);
    if (tokens) {
      tokenExpired = tokens.expires_at < Date.now();
    }
  } catch {
    tokenExpired = true;
  }

  return {
    connected: true,
    realmId: publicConfig?.realmId,
    companyName: publicConfig?.companyName,
    connectedAt: publicConfig?.connectedAt,
    tokenExpired,
  };
}

export { getBaseUrl };
