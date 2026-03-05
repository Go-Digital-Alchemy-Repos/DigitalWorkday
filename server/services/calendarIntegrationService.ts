import { google } from "googleapis";
import { db } from "../db";
import { googleCalendarTokens } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? "";
}

function getClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? "";
}

function getRedirectUri(host: string): string {
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}/api/calendar/callback`;
}

export function isConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getAuthUrl(host: string, statePayload: string): string {
  const oauth2Client = new google.auth.OAuth2(
    getClientId(),
    getClientSecret(),
    getRedirectUri(host),
  );
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: statePayload,
  });
}

export async function handleCallback(
  code: string,
  host: string,
  userId: string,
  tenantId: string,
): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    getClientId(),
    getClientSecret(),
    getRedirectUri(host),
  );

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("No access token returned from Google");
  }

  const existing = await db
    .select({ id: googleCalendarTokens.id })
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(googleCalendarTokens)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        scope: tokens.scope ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarTokens.userId, userId));
  } else {
    await db.insert(googleCalendarTokens).values({
      userId,
      tenantId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      scope: tokens.scope ?? undefined,
    });
  }
}

export async function getConnectionStatus(userId: string): Promise<{ connected: boolean }> {
  const rows = await db
    .select({ id: googleCalendarTokens.id })
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.userId, userId))
    .limit(1);
  return { connected: rows.length > 0 };
}

export async function disconnect(userId: string): Promise<void> {
  const rows = await db
    .select({ accessToken: googleCalendarTokens.accessToken })
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.userId, userId))
    .limit(1);

  if (rows.length > 0) {
    try {
      const oauth2Client = new google.auth.OAuth2(getClientId(), getClientSecret());
      oauth2Client.setCredentials({ access_token: rows[0].accessToken });
      await oauth2Client.revokeCredentials();
    } catch {
      // Ignore revocation errors — still delete local tokens
    }
    await db.delete(googleCalendarTokens).where(eq(googleCalendarTokens.userId, userId));
  }
}

async function getAuthedClient(userId: string) {
  const rows = await db
    .select()
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.userId, userId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Google Calendar not connected");
  }

  const record = rows[0];
  const oauth2Client = new google.auth.OAuth2(getClientId(), getClientSecret());
  oauth2Client.setCredentials({
    access_token: record.accessToken,
    refresh_token: record.refreshToken ?? undefined,
    expiry_date: record.expiresAt ? record.expiresAt.getTime() : undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(googleCalendarTokens)
        .set({
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarTokens.userId, userId));
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export interface FollowUpEventInput {
  clientName: string;
  projectName: string;
  projectId: string;
  followupDueAt: string;
  notes?: string;
  appBaseUrl: string;
}

export async function createFollowUpEvent(
  userId: string,
  input: FollowUpEventInput,
): Promise<{ eventId: string; htmlLink: string }> {
  const calendar = await getAuthedClient(userId);

  const start = new Date(input.followupDueAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const projectUrl = `${input.appBaseUrl}/projects/${input.projectId}`;
  const description = [
    `Project: ${input.projectName}`,
    `Project Link: ${projectUrl}`,
    input.notes ? `\nNotes:\n${input.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: `Follow up with ${input.clientName} — ${input.projectName}`,
      description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 60 },
        ],
      },
    },
  });

  return {
    eventId: event.data.id ?? "",
    htmlLink: event.data.htmlLink ?? "",
  };
}
