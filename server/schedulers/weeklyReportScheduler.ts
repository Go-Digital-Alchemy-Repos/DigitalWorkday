import { runWeeklyReportsForAllTenants } from "../services/weeklyClientReport/weeklyReportService";
import { config } from "../config";

let intervalHandle: NodeJS.Timeout | null = null;

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check every 30 minutes
const TARGET_DAY = 5; // Friday (0=Sun, 5=Fri, 6=Sat)
const TARGET_HOUR = 16; // 4 PM

function shouldRunNow(): boolean {
  const now = new Date();
  return now.getDay() === TARGET_DAY && now.getHours() >= TARGET_HOUR;
}

let lastRunDate: string | null = null;

async function tick(): Promise<void> {
  if (!config.features.enableWeeklyClientReports) return;

  const today = new Date().toISOString().split("T")[0];

  if (!shouldRunNow()) return;
  if (lastRunDate === today) return; // Already ran today

  lastRunDate = today;
  console.log(`[weeklyReports] Friday 4PM trigger — running weekly client reports`);
  try {
    await runWeeklyReportsForAllTenants();
    console.log(`[weeklyReports] Weekly client reports completed`);
  } catch (err) {
    console.error(`[weeklyReports] Weekly reports run failed:`, err);
    lastRunDate = null; // Reset so it can retry
  }
}

export function startWeeklyReportScheduler(): void {
  if (intervalHandle) return;
  console.log(`[weeklyReports] Scheduler started (checks every 30min, runs Fridays at 4PM)`);
  intervalHandle = setInterval(() => { void tick(); }, CHECK_INTERVAL_MS);
}

export function stopWeeklyReportScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log(`[weeklyReports] Scheduler stopped`);
  }
}
