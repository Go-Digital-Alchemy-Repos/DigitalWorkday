import { runAlertEvaluationForAllTenants } from "./evaluateAlertRules";
import { createSingleFlightRunner } from "../lib/singleFlight";

let intervalHandle: NodeJS.Timeout | null = null;
let initialDelayHandle: NodeJS.Timeout | null = null;

const INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

async function tick(): Promise<void> {
  try {
    console.log("Alert scheduler: running evaluation for all tenants");
    await runAlertEvaluationForAllTenants();
    console.log("Alert scheduler: evaluation complete");
  } catch (err) {
    console.error({ err }, "Alert scheduler tick failed");
  }
}

const runTick = createSingleFlightRunner(tick, {
  onSkip: () => console.warn("Alert scheduler: previous evaluation still running, skipping overlapping tick"),
});

export function startAlertScheduler(): void {
  if (intervalHandle || initialDelayHandle) return;
  console.log(`Alert scheduler: starting (initial delay ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 60000}min)`);
  initialDelayHandle = setTimeout(() => {
    initialDelayHandle = null;
    void runTick();
    intervalHandle = setInterval(() => { void runTick(); }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

export function stopAlertScheduler(): void {
  if (initialDelayHandle) {
    clearTimeout(initialDelayHandle);
    initialDelayHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("Alert scheduler: stopped");
  }
}
