import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { db } from "../../db";
import { userActivitySessions } from "@shared/schema";

export const ACTIVITY_IDLE_SPLIT_MS = 5 * 60 * 1000;
export const ACTIVITY_HEARTBEAT_CAP_SECONDS = 90;
export const ACTIVITY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export type ActivityState = "active" | "idle" | "hidden";
export type ActivityPlatform = "browser" | "macos";

type SessionIdentity = {
  userId: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  platform: ActivityPlatform;
  deviceLabel: string;
  sourceSessionId?: string | null;
};

type SessionClock = {
  state: string;
  lastSeenAt: Date;
  lastActiveAt?: Date;
  activeSeconds: number;
};

export function advanceActivityClock(previous: SessionClock, now: Date) {
  const gapMs = Math.max(0, now.getTime() - previous.lastSeenAt.getTime());
  const shouldSplit = gapMs >= ACTIVITY_IDLE_SPLIT_MS;
  const creditedSeconds = previous.state === "active" && !shouldSplit
    ? Math.min(ACTIVITY_HEARTBEAT_CAP_SECONDS, Math.floor(gapMs / 1000))
    : 0;
  return {
    shouldSplit,
    creditedSeconds,
    activeSeconds: previous.activeSeconds + creditedSeconds,
  };
}

export function shouldEndActivitySession(previous: SessionClock, nextState: ActivityState, now: Date): boolean {
  if (nextState === "idle") return true;
  if (nextState !== "hidden" || previous.state !== "hidden") return false;
  const lastActiveAt = previous.lastActiveAt || previous.lastSeenAt;
  return now.getTime() - lastActiveAt.getTime() >= ACTIVITY_IDLE_SPLIT_MS;
}

export function friendlyBrowserDevice(userAgent?: string | null): string {
  const ua = userAgent || "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /CriOS\//.test(ua) ? "Chrome"
    : /FxiOS\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Macintosh|Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "device";
  return `${browser} on ${os}`;
}

export function friendlyMacDevice(deviceName?: string | null): string {
  const clean = (deviceName || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 80);
  return clean || "Mac Desktop";
}

export function opaqueActivitySourceId(namespace: string, rawSourceId: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(rawSourceId).digest("base64url");
  return `${namespace}:${digest}`;
}

export async function startActivitySession(identity: SessionIdentity, now = new Date()): Promise<string> {
  const [created] = await db.insert(userActivitySessions).values({
    ...identity,
    tenantId: identity.tenantId || null,
    workspaceId: identity.workspaceId || null,
    sourceSessionId: identity.sourceSessionId || null,
    state: "active",
    startedAt: now,
    lastSeenAt: now,
    lastActiveAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning({ id: userActivitySessions.id });
  if (created) return created.id;
  if (identity.sourceSessionId) {
    const [existing] = await db.select({ id: userActivitySessions.id }).from(userActivitySessions)
      .where(and(
        eq(userActivitySessions.sourceSessionId, identity.sourceSessionId),
        isNull(userActivitySessions.endedAt),
      ))
      .limit(1);
    if (existing) return existing.id;
  }
  throw new Error("Unable to create activity session");
}

export async function heartbeatActivitySession(
  identity: SessionIdentity,
  state: ActivityState,
  sessionId?: string | null,
  now = new Date(),
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const sourceConditions = identity.sourceSessionId
      ? and(
          eq(userActivitySessions.userId, identity.userId),
          eq(userActivitySessions.platform, identity.platform),
          eq(userActivitySessions.sourceSessionId, identity.sourceSessionId),
          isNull(userActivitySessions.endedAt),
        )
      : undefined;
    const conditions = sessionId
      ? and(eq(userActivitySessions.id, sessionId), eq(userActivitySessions.userId, identity.userId), isNull(userActivitySessions.endedAt))
      : sourceConditions;
    const [current] = await tx.select().from(userActivitySessions)
      .where(conditions)
      .orderBy(desc(userActivitySessions.startedAt))
      .limit(1)
      .for("update");

    if (!current) {
      if (state !== "active") return sessionId || null;
      const [created] = await tx.insert(userActivitySessions).values({
        ...identity,
        tenantId: identity.tenantId || null,
        workspaceId: identity.workspaceId || null,
        sourceSessionId: identity.sourceSessionId || null,
        state,
        startedAt: now,
        lastSeenAt: now,
        lastActiveAt: now,
        updatedAt: now,
      }).onConflictDoNothing().returning({ id: userActivitySessions.id });
      if (created) return created.id;
      if (sourceConditions) {
        const [winner] = await tx.select({ id: userActivitySessions.id }).from(userActivitySessions)
          .where(sourceConditions)
          .limit(1)
          .for("update");
        if (winner) return winner.id;
      }
      throw new Error("Unable to create activity session");
    }

    const next = advanceActivityClock(current, now);
    if (shouldEndActivitySession(current, state, now)) {
      await tx.update(userActivitySessions).set({
        state: "ended",
        endedAt: now,
        activeSeconds: next.activeSeconds,
        updatedAt: now,
      }).where(eq(userActivitySessions.id, current.id));
      return current.id;
    }
    if (next.shouldSplit) {
      await tx.update(userActivitySessions).set({
        state: "ended",
        endedAt: current.lastSeenAt,
        updatedAt: now,
      }).where(eq(userActivitySessions.id, current.id));
      const [created] = await tx.insert(userActivitySessions).values({
        ...identity,
        tenantId: identity.tenantId || null,
        workspaceId: identity.workspaceId || null,
        sourceSessionId: identity.sourceSessionId || null,
        state,
        startedAt: now,
        lastSeenAt: now,
        lastActiveAt: now,
        updatedAt: now,
      }).returning({ id: userActivitySessions.id });
      return created.id;
    }

    await tx.update(userActivitySessions).set({
      state,
      lastSeenAt: now,
      lastActiveAt: state === "active" ? now : current.lastActiveAt,
      activeSeconds: next.activeSeconds,
      updatedAt: now,
    }).where(eq(userActivitySessions.id, current.id));
    return current.id;
  });
}

export async function closeActivitySession(sessionId?: string | null, now = new Date()): Promise<void> {
  if (!sessionId) return;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(userActivitySessions)
      .where(and(eq(userActivitySessions.id, sessionId), isNull(userActivitySessions.endedAt)))
      .limit(1)
      .for("update");
    if (!current) return;
    const next = advanceActivityClock(current, now);
    await tx.update(userActivitySessions).set({
      state: "ended",
      endedAt: next.shouldSplit ? current.lastSeenAt : now,
      activeSeconds: next.activeSeconds,
      updatedAt: now,
    }).where(eq(userActivitySessions.id, current.id));
  });
}

export async function closeActivitySessionsBySource(sourceSessionId: string, now = new Date()): Promise<void> {
  const sessions = await db.select({ id: userActivitySessions.id })
    .from(userActivitySessions)
    .where(and(eq(userActivitySessions.sourceSessionId, sourceSessionId), isNull(userActivitySessions.endedAt)));
  await Promise.all(sessions.map((session) => closeActivitySession(session.id, now)));
}

export async function purgeExpiredActivitySessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_MS);
  let removed = 0;
  const batchSize = 1_000;
  while (true) {
    const result = await db.execute(sql`
      WITH expired AS (
        SELECT id FROM ${userActivitySessions}
        WHERE ${userActivitySessions.startedAt} < ${cutoff}
        ORDER BY ${userActivitySessions.startedAt}
        LIMIT ${batchSize}
      )
      DELETE FROM ${userActivitySessions}
      WHERE id IN (SELECT id FROM expired)
      RETURNING id
    `);
    const batchCount = result.rows.length;
    removed += batchCount;
    if (batchCount < batchSize) return removed;
  }
}

export async function finalizeAbandonedActivitySessions(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - ACTIVITY_IDLE_SPLIT_MS);
  const finalized = await db.update(userActivitySessions).set({
    state: "ended",
    endedAt: sql`${userActivitySessions.lastSeenAt}`,
    updatedAt: now,
  }).where(and(
    isNull(userActivitySessions.endedAt),
    lt(userActivitySessions.lastSeenAt, staleBefore),
  )).returning({ id: userActivitySessions.id });
  return finalized.length;
}

let retentionTimer: NodeJS.Timeout | undefined;
export function startActivitySessionRetentionJob(): void {
  if (retentionTimer) return;
  let lastRetentionCleanup = 0;
  const run = () => void (async () => {
    await finalizeAbandonedActivitySessions();
    if (Date.now() - lastRetentionCleanup >= 24 * 60 * 60 * 1000) {
      await purgeExpiredActivitySessions();
      lastRetentionCleanup = Date.now();
    }
  })().catch((error) => console.error("[activity-session] maintenance failed", error));
  run();
  retentionTimer = setInterval(run, 60 * 1000);
  retentionTimer.unref();
}
