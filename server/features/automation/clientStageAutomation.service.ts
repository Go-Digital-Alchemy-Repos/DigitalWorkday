import { storage } from "../../storage";
import {
  CLIENT_STAGES_ORDERED,
  type ClientStageType,
  type ClientStageAutomationRule,
  type AutomationTriggerTypeValue,
} from "@shared/schema";

export interface AutomationEvent {
  tenantId: string;
  workspaceId?: string;
  clientId: string;
  projectId?: string;
  triggerType: AutomationTriggerTypeValue;
  payload: Record<string, any>;
  userId: string;
}

export interface EvaluationResult {
  ruleId: string;
  ruleName: string;
  outcome: "applied" | "skipped" | "failed";
  reason?: string;
  fromStage?: string;
  toStage?: string;
}

function getStageIndex(stage: string): number {
  return CLIENT_STAGES_ORDERED.indexOf(stage as ClientStageType);
}

function matchesTriggerConfig(rule: ClientStageAutomationRule, event: AutomationEvent): boolean {
  const config = (rule.triggerConfig || {}) as Record<string, any>;

  switch (rule.triggerType) {
    case "project_created": {
      if (config.anyProject) return true;
      if (config.projectType && event.payload.projectType) {
        return config.projectType === event.payload.projectType;
      }
      return true;
    }

    case "project_status_changed": {
      if (config.to && event.payload.toStatus) {
        const toMatch = config.to === event.payload.toStatus;
        if (config.from) {
          return toMatch && config.from === event.payload.fromStatus;
        }
        return toMatch;
      }
      return true;
    }

    case "task_completed": {
      if (config.sectionName && event.payload.sectionName) {
        return config.sectionName.toLowerCase() === event.payload.sectionName.toLowerCase();
      }
      if (config.taskTag && event.payload.taskTags) {
        return (event.payload.taskTags as string[]).some(
          (t: string) => t.toLowerCase() === config.taskTag.toLowerCase()
        );
      }
      return true;
    }

    case "all_tasks_in_section_completed": {
      if (config.sectionName && event.payload.sectionName) {
        return config.sectionName.toLowerCase() === event.payload.sectionName.toLowerCase();
      }
      return true;
    }

    case "project_marked_complete": {
      return true;
    }

    default:
      return false;
  }
}

function matchesConditions(rule: ClientStageAutomationRule, currentStage: string): boolean {
  const conditions = (rule.conditionConfig || {}) as Record<string, any>;
  if (conditions.currentStageIn && Array.isArray(conditions.currentStageIn)) {
    if (!conditions.currentStageIn.includes(currentStage)) {
      return false;
    }
  }
  return true;
}

function canApplyStageChange(
  rule: ClientStageAutomationRule,
  currentStage: string,
  targetStage: string
): { allowed: boolean; reason?: string } {
  if (currentStage === targetStage) {
    return { allowed: false, reason: "Client is already in the target stage" };
  }

  const currentIdx = getStageIndex(currentStage);
  const targetIdx = getStageIndex(targetStage);

  if (currentIdx === -1 || targetIdx === -1) {
    return { allowed: false, reason: "Unknown stage value" };
  }

  if (targetIdx < currentIdx && !rule.allowBackward) {
    return { allowed: false, reason: `Backward move from ${currentStage} to ${targetStage} not allowed by rule` };
  }

  if (!rule.allowSkipStages && Math.abs(targetIdx - currentIdx) > 1) {
    return { allowed: false, reason: `Skipping stages from ${currentStage} to ${targetStage} not allowed by rule` };
  }

  return { allowed: true };
}

export async function evaluateAutomation(
  event: AutomationEvent,
  dryRun = false
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];

  try {
    const rules = await storage.getAutomationRulesByTenant(event.tenantId, true);
    const matchingRules = rules.filter((r) => {
      if (r.triggerType !== event.triggerType) return false;
      if (r.workspaceId && r.workspaceId !== event.workspaceId) return false;
      return true;
    });

    if (matchingRules.length === 0) return results;

    const client = await storage.getClientByIdAndTenant(event.clientId, event.tenantId);
    if (!client) return results;

    const currentStage = client.stage || "lead";

    for (const rule of matchingRules) {
      const result: EvaluationResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        outcome: "skipped",
        fromStage: currentStage,
        toStage: rule.toStage,
      };

      if (!matchesTriggerConfig(rule, event)) {
        result.reason = "Trigger config does not match event payload";
        results.push(result);
        continue;
      }

      if (!matchesConditions(rule, currentStage)) {
        result.reason = "Conditions not met (current stage filter)";
        results.push(result);
        continue;
      }

      const { allowed, reason } = canApplyStageChange(rule, currentStage, rule.toStage);
      if (!allowed) {
        result.reason = reason;
        results.push(result);
        continue;
      }

      if (dryRun) {
        result.outcome = "applied";
        result.reason = "Dry run - would apply";
        results.push(result);
        continue;
      }

      try {
        await storage.updateClientStage(
          event.clientId,
          event.tenantId,
          rule.toStage,
          event.userId
        );

        result.outcome = "applied";
        result.reason = `Stage changed from ${currentStage} to ${rule.toStage}`;
      } catch (err: any) {
        result.outcome = "failed";
        result.reason = err.message || "Failed to update stage";
      }

      results.push(result);

      if (result.outcome === "applied") break;
    }

    if (!dryRun) {
      for (const r of results) {
        await storage.createAutomationEvent({
          tenantId: event.tenantId,
          ruleId: r.ruleId,
          ruleName: r.ruleName,
          clientId: event.clientId,
          projectId: event.projectId || null,
          triggerType: event.triggerType,
          payload: event.payload,
          outcome: r.outcome,
          reason: r.reason || null,
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error("[automation] Error evaluating rules:", err.message);
  }

  return results;
}

export async function evaluateDryRun(
  event: AutomationEvent
): Promise<EvaluationResult[]> {
  return evaluateAutomation(event, true);
}
