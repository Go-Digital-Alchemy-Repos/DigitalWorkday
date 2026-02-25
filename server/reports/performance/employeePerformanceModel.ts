/**
 * EMPLOYEE PERFORMANCE INDEX (EPI) — PERFORMANCE MODEL
 *
 * Defines the scoring weights, normalization functions, and tier thresholds
 * for the Employee Performance Index system.
 *
 * All component scores are normalized to 0–100 before weighting.
 * The final EPI score is 0–100.
 *
 * @module server/reports/performance/employeePerformanceModel
 */

// ── COMPONENT WEIGHTS ──────────────────────────────────────────────────────────
// Must sum to 1.0
export const PerformanceComponents = {
  completionRateWeight:  0.25,
  overdueWeight:         0.20,
  utilizationWeight:     0.20,
  efficiencyWeight:      0.20,
  timeComplianceWeight:  0.15,
} as const;

// ── TIER THRESHOLDS ────────────────────────────────────────────────────────────
export type PerformanceTier = "High" | "Stable" | "Needs Attention" | "Critical";

export function getPerformanceTier(score: number): PerformanceTier {
  if (score >= 85) return "High";
  if (score >= 70) return "Stable";
  if (score >= 50) return "Needs Attention";
  return "Critical";
}

export const TierConfig: Record<PerformanceTier, { color: string; description: string }> = {
  High:             { color: "green",  description: "Performing above expectations across all dimensions" },
  Stable:           { color: "blue",   description: "Performing within acceptable range" },
  "Needs Attention":{ color: "orange", description: "One or more metrics require improvement" },
  Critical:         { color: "red",    description: "Multiple metrics below acceptable thresholds" },
};

// ── SCORE NORMALIZATION FUNCTIONS ──────────────────────────────────────────────

/**
 * completionRateScore
 * Linear: 0% completion → score 0, 100% completion → score 100
 * completionRate is already a 0–100 percentage.
 */
export function normalizeCompletionRate(completionRatePct: number | null): number {
  if (completionRatePct === null) return 50;
  return Math.min(100, Math.max(0, Math.round(completionRatePct)));
}

/**
 * overdueScore
 * Inverse scaled: 0% overdue rate → score 100, 50%+ overdue rate → score 0
 * overdueRate = overdueCount / activeTasks (0–1)
 */
export function normalizeOverdueRate(overdueRate: number | null): number {
  if (overdueRate === null || overdueRate === 0) return 100;
  const pct = Math.min(overdueRate, 1);
  return Math.max(0, Math.round((1 - pct * 2) * 100));
}

/**
 * utilizationScore
 * Optimal band: 70–95% → score 100
 * 50–70% and 95–120%: linearly degrades to 50
 * Below 50% or above 120%: score 0
 *
 * utilizationPct is a 0–200+ integer representing % of 8h/day utilization
 */
export function normalizeUtilization(utilizationPct: number | null): number {
  if (utilizationPct === null) return 40;

  const u = utilizationPct;

  if (u >= 70 && u <= 95) return 100;

  if (u >= 50 && u < 70) {
    return Math.round(50 + ((u - 50) / 20) * 50);
  }

  if (u > 95 && u <= 120) {
    return Math.round(100 - ((u - 95) / 25) * 50);
  }

  if (u > 120) {
    if (u >= 150) return 0;
    return Math.round(50 - ((u - 120) / 30) * 50);
  }

  return 0;
}

/**
 * efficiencyScore
 * Optimal band: 0.9–1.2 → score 100
 * 0.7–0.9: linearly degrades to 60
 * 1.2–1.5: linearly degrades to 60
 * Below 0.7 or above 1.5: score 20
 *
 * efficiencyRatio = actualHours / estimatedHours
 * null means no estimate data → neutral score 50
 */
export function normalizeEfficiency(efficiencyRatio: number | null): number {
  if (efficiencyRatio === null) return 50;

  const e = efficiencyRatio;

  if (e >= 0.9 && e <= 1.2) return 100;

  if (e >= 0.7 && e < 0.9) {
    return Math.round(60 + ((e - 0.7) / 0.2) * 40);
  }

  if (e > 1.2 && e <= 1.5) {
    return Math.round(100 - ((e - 1.2) / 0.3) * 40);
  }

  return 20;
}

/**
 * timeComplianceScore
 * % of working days in the range where at least one time entry was logged.
 * loggedDays / daysInRange * 100 → linear 0–100
 */
export function normalizeTimeCompliance(loggedDays: number, daysInRange: number): number {
  if (daysInRange <= 0) return 50;
  const pct = (loggedDays / daysInRange) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

// ── COMPOSITE SCORE ────────────────────────────────────────────────────────────

export interface ComponentScores {
  completion: number;
  overdue: number;
  utilization: number;
  efficiency: number;
  compliance: number;
}

export function computeOverallScore(components: ComponentScores): number {
  const {
    completionRateWeight,
    overdueWeight,
    utilizationWeight,
    efficiencyWeight,
    timeComplianceWeight,
  } = PerformanceComponents;

  const weighted =
    components.completion  * completionRateWeight +
    components.overdue     * overdueWeight +
    components.utilization * utilizationWeight +
    components.efficiency  * efficiencyWeight +
    components.compliance  * timeComplianceWeight;

  return Math.round(weighted);
}
