/**
 * CLIENT HEALTH INDEX (CHI) — HEALTH MODEL
 *
 * Defines scoring weights, normalization functions, and tier thresholds
 * for the Client Health Index system.
 *
 * All component scores are normalized to 0–100 before weighting.
 * The final CHI score is 0–100.
 *
 * @module server/reports/health/clientHealthModel
 */

// ── COMPONENT WEIGHTS ──────────────────────────────────────────────────────────
// Must sum to 1.0
export const HealthComponents = {
  overdueWeight:       0.25,
  engagementWeight:    0.20,
  timeOverrunWeight:   0.20,
  slaComplianceWeight: 0.20,
  activityWeight:      0.15,
} as const;

// ── TIER THRESHOLDS ────────────────────────────────────────────────────────────
export type HealthTier = "Healthy" | "Monitor" | "At Risk" | "Critical";

export function getHealthTier(score: number): HealthTier {
  if (score >= 85) return "Healthy";
  if (score >= 70) return "Monitor";
  if (score >= 50) return "At Risk";
  return "Critical";
}

export const TierConfig: Record<HealthTier, { color: string; description: string }> = {
  Healthy:    { color: "green",  description: "Client relationship is performing well across all dimensions" },
  Monitor:    { color: "blue",   description: "Client relationship is within acceptable range but warrants attention" },
  "At Risk":  { color: "orange", description: "One or more health metrics require immediate attention" },
  Critical:   { color: "red",    description: "Client relationship has multiple failing health indicators" },
};

// ── SCORE NORMALIZATION FUNCTIONS ──────────────────────────────────────────────

/**
 * overdueScore
 * Inverse of overdue task percentage.
 * 0% overdue tasks → score 100
 * 50%+ overdue tasks → score 0
 * overdueRate = overdueCount / totalTasks (0–1)
 */
export function normalizeOverdueRate(overdueCount: number, totalTasks: number): number {
  if (totalTasks === 0) return 80;
  const rate = overdueCount / totalTasks;
  return Math.max(0, Math.round((1 - rate * 2) * 100));
}

/**
 * engagementScore
 * Composite of time logged + comment activity frequency in the range.
 * Logic:
 *   - Time logged: 0h → 0 pts, 40h+ → 50 pts (linear)
 *   - Comments: 0 → 0 pts, 10+ → 50 pts (linear)
 * Combined and clamped 0–100.
 * Null/no data → 30 (low neutral).
 */
export function normalizeEngagement(
  totalHoursInRange: number,
  commentCount: number
): number {
  const hoursPts = Math.min(50, Math.round((Math.min(totalHoursInRange, 40) / 40) * 50));
  const commentPts = Math.min(50, Math.round((Math.min(commentCount, 10) / 10) * 50));
  return Math.min(100, hoursPts + commentPts);
}

/**
 * timeOverrunScore
 * Estimated vs actual hours variance.
 * No estimates → neutral 50.
 * actual <= estimated → 100
 * actual = estimated * 1.5 → ~50
 * actual >= estimated * 2 → 0
 */
export function normalizeTimeOverrun(
  totalHours: number,
  estimatedHours: number
): number {
  if (estimatedHours <= 0) return 50;
  const ratio = totalHours / estimatedHours;
  if (ratio <= 1.0) return 100;
  if (ratio <= 1.5) return Math.round(100 - ((ratio - 1.0) / 0.5) * 50);
  if (ratio <= 2.0) return Math.round(50 - ((ratio - 1.5) / 0.5) * 50);
  return 0;
}

/**
 * slaComplianceScore
 * % of tasks completed on or before due date.
 * No tasks with due dates → neutral 60.
 * Linear 0–100.
 */
export function normalizeSlaCompliance(
  completedOnTime: number,
  totalDoneWithDue: number
): number {
  if (totalDoneWithDue === 0) return 60;
  return Math.min(100, Math.max(0, Math.round((completedOnTime / totalDoneWithDue) * 100)));
}

/**
 * activityScore
 * Inverse scaled on days since last activity.
 * 0 days inactive → 100
 * 7 days inactive → ~77
 * 14 days inactive → ~53
 * 21 days inactive → ~30
 * 30+ days inactive → 0
 * No activity ever → 0
 */
export function normalizeActivity(daysSinceLastActivity: number | null): number {
  if (daysSinceLastActivity === null) return 0;
  if (daysSinceLastActivity <= 0) return 100;
  if (daysSinceLastActivity >= 30) return 0;
  return Math.max(0, Math.round((1 - daysSinceLastActivity / 30) * 100));
}

// ── COMPOSITE SCORE ────────────────────────────────────────────────────────────

export interface HealthComponentScores {
  overdue: number;
  engagement: number;
  timeOverrun: number;
  slaCompliance: number;
  activity: number;
}

export function computeOverallHealthScore(components: HealthComponentScores): number {
  const {
    overdueWeight,
    engagementWeight,
    timeOverrunWeight,
    slaComplianceWeight,
    activityWeight,
  } = HealthComponents;

  const weighted =
    components.overdue      * overdueWeight +
    components.engagement   * engagementWeight +
    components.timeOverrun  * timeOverrunWeight +
    components.slaCompliance * slaComplianceWeight +
    components.activity     * activityWeight;

  return Math.round(weighted);
}
