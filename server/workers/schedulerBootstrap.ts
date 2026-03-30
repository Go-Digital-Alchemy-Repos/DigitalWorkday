import { startAlertScheduler, stopAlertScheduler } from "../alerts/alertScheduler";
import { startDigestScheduler, stopDigestScheduler } from "../digests/digestScheduler";
import { startRetentionScheduler, stopRetentionScheduler } from "../retention/retentionScheduler";
import {
  startDeadlineChecker,
  stopDeadlineChecker,
  startFollowUpChecker,
  stopFollowUpChecker,
} from "../features/notifications/notification.service";
import { evaluateSlaPolicies } from "../http/domains/support.router";
import { evaluateConversationSla } from "../routes/modules/crm/conversations.router";

let slaInterval: NodeJS.Timeout | null = null;

export function startAllSchedulers(): void {
  console.log("[scheduler-bootstrap] Starting all schedulers...");

  startAlertScheduler();
  startDigestScheduler();
  startRetentionScheduler();
  startDeadlineChecker();
  startFollowUpChecker();

  const SLA_CHECK_INTERVAL_MS = 5 * 60_000;
  if (slaInterval) {
    clearInterval(slaInterval);
  }
  slaInterval = setInterval(async () => {
    try {
      const result = await evaluateSlaPolicies();
      if (result.firstResponseBreaches > 0 || result.resolutionBreaches > 0) {
        console.log(`[sla-evaluator] Checked ${result.checked} tickets: ${result.firstResponseBreaches} first-response breaches, ${result.resolutionBreaches} resolution breaches`);
      }
    } catch (err) {
      console.error("[sla-evaluator] Error:", err);
    }
    try {
      const result = await evaluateConversationSla();
      if (result.firstResponseBreaches > 0 || result.resolutionBreaches > 0) {
        console.log(`[conversation-sla] Checked ${result.checked} conversations: ${result.firstResponseBreaches} first-response breaches, ${result.resolutionBreaches} resolution breaches`);
      }
    } catch (err) {
      console.error("[conversation-sla] Error:", err);
    }
  }, SLA_CHECK_INTERVAL_MS);
  console.log("[scheduler-bootstrap] SLA evaluator scheduled (every 5 minutes)");

  console.log("[scheduler-bootstrap] All schedulers started");
}

export function stopAllSchedulers(): void {
  console.log("[scheduler-bootstrap] Stopping all schedulers...");

  stopAlertScheduler();
  stopDigestScheduler();
  stopRetentionScheduler();
  stopDeadlineChecker();
  stopFollowUpChecker();

  if (slaInterval) {
    clearInterval(slaInterval);
    slaInterval = null;
    console.log("[scheduler-bootstrap] SLA evaluator stopped");
  }

  console.log("[scheduler-bootstrap] All schedulers stopped");
}
