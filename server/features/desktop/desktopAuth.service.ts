import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  desktopAuthorizationCodes,
  desktopSessions,
  users,
  type User,
} from "@shared/schema";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;

export const DESKTOP_CLIENT_ID = "digital-workday-macos";
export const DESKTOP_REDIRECT_URI = "digitalworkday://auth/callback";

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashDesktopToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function derivePKCEChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface DesktopTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  sessionId: string;
}

export async function issueDesktopAuthorizationCode(input: {
  userId: string;
  tenantId: string;
  workspaceId: string;
  codeChallenge: string;
  redirectUri: string;
}): Promise<string> {
  const code = randomToken();
  await db.insert(desktopAuthorizationCodes).values({
    codeHash: hashDesktopToken(code),
    userId: input.userId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    codeChallenge: input.codeChallenge,
    redirectUri: input.redirectUri,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
  });
  return code;
}

export async function exchangeDesktopAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  deviceName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<DesktopTokenResponse | null> {
  const now = new Date();
  const codeHash = hashDesktopToken(input.code);

  return db.transaction(async (tx) => {
    const [grant] = await tx
      .select()
      .from(desktopAuthorizationCodes)
      .where(and(
        eq(desktopAuthorizationCodes.codeHash, codeHash),
        isNull(desktopAuthorizationCodes.usedAt),
        gt(desktopAuthorizationCodes.expiresAt, now),
      ))
      .limit(1)
      .for("update");

    if (!grant || grant.redirectUri !== input.redirectUri) return null;
    if (!safeEqual(derivePKCEChallenge(input.codeVerifier), grant.codeChallenge)) return null;

    await tx
      .update(desktopAuthorizationCodes)
      .set({ usedAt: now })
      .where(eq(desktopAuthorizationCodes.id, grant.id));

    const accessToken = randomToken();
    const refreshToken = randomToken(48);
    const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const [session] = await tx.insert(desktopSessions).values({
      userId: grant.userId,
      tenantId: grant.tenantId,
      workspaceId: grant.workspaceId,
      deviceName: input.deviceName?.trim().slice(0, 200) || null,
      ipAddress: input.ipAddress?.trim().slice(0, 200) || null,
      userAgent: input.userAgent?.trim().slice(0, 500) || null,
      accessTokenHash: hashDesktopToken(accessToken),
      accessExpiresAt,
      refreshTokenHash: hashDesktopToken(refreshToken),
      refreshExpiresAt,
    }).returning({ id: desktopSessions.id });

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      sessionId: session.id,
    };
  });
}

export async function rotateDesktopRefreshToken(input: {
  refreshToken: string;
  deviceName?: string | null;
}): Promise<DesktopTokenResponse | null> {
  const now = new Date();
  const refreshTokenHash = hashDesktopToken(input.refreshToken);

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(desktopSessions)
      .where(and(
        eq(desktopSessions.refreshTokenHash, refreshTokenHash),
        isNull(desktopSessions.revokedAt),
        gt(desktopSessions.refreshExpiresAt, now),
      ))
      .limit(1)
      .for("update");
    if (!session) return null;

    const accessToken = randomToken();
    const refreshToken = randomToken(48);
    const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    await tx.update(desktopSessions).set({
      accessTokenHash: hashDesktopToken(accessToken),
      accessExpiresAt,
      refreshTokenHash: hashDesktopToken(refreshToken),
      refreshExpiresAt,
      deviceName: input.deviceName?.trim().slice(0, 200) || session.deviceName,
      lastUsedAt: now,
      updatedAt: now,
    }).where(eq(desktopSessions.id, session.id));

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      sessionId: session.id,
    };
  });
}

export interface AuthenticatedDesktopSession {
  sessionId: string;
  tenantId: string;
  workspaceId: string;
  accessExpiresAt: Date;
  user: Omit<User, "passwordHash">;
}

export async function authenticateDesktopAccessToken(
  accessToken: string,
): Promise<AuthenticatedDesktopSession | null> {
  if (accessToken.length < 32 || accessToken.length > 256) return null;
  const now = new Date();
  const [result] = await db
    .select({ session: desktopSessions, user: users })
    .from(desktopSessions)
    .innerJoin(users, eq(desktopSessions.userId, users.id))
    .where(and(
      eq(desktopSessions.accessTokenHash, hashDesktopToken(accessToken)),
      isNull(desktopSessions.revokedAt),
      gt(desktopSessions.accessExpiresAt, now),
      eq(users.isActive, true),
    ))
    .limit(1);
  if (!result) return null;

  void db.update(desktopSessions)
    .set({ lastUsedAt: now })
    .where(eq(desktopSessions.id, result.session.id));

  const { passwordHash: _passwordHash, ...safeUser } = result.user;
  return {
    sessionId: result.session.id,
    tenantId: result.session.tenantId,
    workspaceId: result.session.workspaceId,
    accessExpiresAt: result.session.accessExpiresAt,
    user: safeUser,
  };
}

export async function revokeDesktopSessionByRefreshToken(refreshToken: string): Promise<boolean> {
  const [revoked] = await db.update(desktopSessions).set({
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(desktopSessions.refreshTokenHash, hashDesktopToken(refreshToken)),
    isNull(desktopSessions.revokedAt),
  )).returning({ id: desktopSessions.id });
  return Boolean(revoked);
}

export async function listDesktopSessions(userId: string) {
  return db.select({
    id: desktopSessions.id,
    deviceName: desktopSessions.deviceName,
    lastUsedAt: desktopSessions.lastUsedAt,
    createdAt: desktopSessions.createdAt,
    revokedAt: desktopSessions.revokedAt,
  }).from(desktopSessions).where(eq(desktopSessions.userId, userId));
}

export async function revokeDesktopSessionById(sessionId: string, userId: string): Promise<boolean> {
  const [revoked] = await db.update(desktopSessions).set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(desktopSessions.id, sessionId), eq(desktopSessions.userId, userId), isNull(desktopSessions.revokedAt)))
    .returning({ id: desktopSessions.id });
  return Boolean(revoked);
}
