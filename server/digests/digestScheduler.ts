import { db } from "../db";
import { sql } from "drizzle-orm";
import { sendDigestToRecipients } from "./generateOpsDigest";


async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

interface DigestScheduleRow {
  id: string;
  tenantId: string;
  isEnabled: boolean;
  dayOfWeek: number;
  hourLocal: number;
  timezone: string;
  recipientsScope: string;
  targetUserIds: string[] | null;
  includeSections: string[] | null;
  lastSentAt: string | null;
}

function isDue(schedule: DigestScheduleRow, now: Date): boolean {
  try {
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: schedule.timezone || "UTC" }));
    const currentDay = localNow.getDay();
    const targetDay = schedule.dayOfWeek;
    if (currentDay !== targetDay) return false;
    if (localNow.getHours() !== schedule.hourLocal) return false;

    if (!schedule.lastSentAt) return true;
    const lastSent = new Date(schedule.lastSentAt);
    const msSinceSent = now.getTime() - lastSent.getTime();
    const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
    return msSinceSent > sixDaysMs;
  } catch {
    return false;
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

const INTERVAL_MS = 60 * 60 * 1000;

async function tick(): Promise<void> {
  const now = new Date();
  try {
    const schedules = await dbRows<DigestScheduleRow>(sql`
      SELECT * FROM ops_digest_schedules WHERE is_enabled = true
    `);

    for (const schedule of schedules) {
      if (!isDue(schedule, now)) continue;
      try {
        console.log({ tenantId: schedule.tenantId }, "Ops digest: sending scheduled digest");
        await sendDigestToRecipients(schedule.tenantId, schedule);
      } catch (err) {
        console.error({ err, tenantId: schedule.tenantId }, "Failed to send ops digest for tenant");
      }
    }
  } catch (err) {
    console.error({ err }, "Digest scheduler tick failed");
  }
}

export function startDigestScheduler(): void {
  if (intervalHandle) return;
  console.log("Digest scheduler: starting (checking every 60min)");
  intervalHandle = setInterval(() => { void tick(); }, INTERVAL_MS);
}

export function stopDigestScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("Digest scheduler: stopped");
  }
}
