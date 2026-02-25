import { db } from "../db";
import { tenants } from "@shared/schema";
import { runSoftArchive } from "./softArchiveRunner";

let intervalHandle: NodeJS.Timeout | null = null;
let initialDelayHandle: NodeJS.Timeout | null = null;

const INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const INITIAL_DELAY_MS = 5 * 60 * 1000; // 5 minutes after startup

async function tick(): Promise<void> {
  try {
    console.log("[retention] Starting daily soft archive run for all tenants");
    const allTenants = await db.select({ id: tenants.id }).from(tenants);
    
    for (const tenant of allTenants) {
      try {
        const result = await runSoftArchive(tenant.id);
        if (result.tasksArchived > 0 || result.messagesArchived > 0) {
          console.log(`[retention] Archived for tenant ${tenant.id}: ${result.tasksArchived} tasks, ${result.messagesArchived} messages`);
        }
      } catch (err) {
        console.error(`[retention] Failed to run archive for tenant ${tenant.id}:`, err);
      }
    }
    console.log("[retention] Daily soft archive run complete");
  } catch (err) {
    console.error("[retention] Retention scheduler tick failed:", err);
  }
}

export function startRetentionScheduler(): void {
  if (intervalHandle) return;
  console.log(`[retention] Starting scheduler (initial delay ${INITIAL_DELAY_MS / 60000}min, then every 24h)`);
  initialDelayHandle = setTimeout(() => {
    void tick();
    intervalHandle = setInterval(() => { void tick(); }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

export function stopRetentionScheduler(): void {
  if (initialDelayHandle) {
    clearTimeout(initialDelayHandle);
    initialDelayHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[retention] Scheduler stopped");
  }
}
