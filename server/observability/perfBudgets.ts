/**
 * @file server/observability/perfBudgets.ts
 * @description P95 response-time and payload budgets for hot API endpoints.
 *
 * Thresholds are used for WARNINGS only — never for hard failures.
 * If a request exceeds its budget a [perf:budget] warn line is emitted.
 * Adjust values per environment via PERF_BUDGET_MULTIPLIER env var
 * (e.g. PERF_BUDGET_MULTIPLIER=2 doubles all thresholds in slow CI).
 */

export interface EndpointBudget {
  p95Ms: number;
  maxPayloadBytes?: number;
  maxDbQueries?: number;
}

const multiplier = Number(process.env.PERF_BUDGET_MULTIPLIER) || 1;

function ms(base: number): number {
  return Math.round(base * multiplier);
}

export const PERF_BUDGETS: Record<string, EndpointBudget> = {
  "/api/tasks/my": {
    p95Ms: ms(800),
    maxPayloadBytes: 500_000,
    maxDbQueries: 12,
  },
  "/api/tasks": {
    p95Ms: ms(600),
    maxPayloadBytes: 300_000,
  },
  "/api/clients": {
    p95Ms: ms(700),
    maxPayloadBytes: 300_000,
    maxDbQueries: 6,
  },
  "/api/projects": {
    p95Ms: ms(600),
    maxPayloadBytes: 300_000,
    maxDbQueries: 8,
  },
  "/api/v1/notifications/unread-count": {
    p95Ms: ms(200),
    maxPayloadBytes: 1_000,
  },
  "/api/v1/notifications": {
    p95Ms: ms(400),
    maxPayloadBytes: 200_000,
  },
  "/api/v1/reports/workload": {
    p95Ms: ms(2_000),
    maxPayloadBytes: 1_000_000,
  },
};

/**
 * Returns the budget for the given route, or undefined if no budget is defined.
 * Matches exact paths first, then prefix-based lookups.
 */
export function getBudgetForRoute(route: string): EndpointBudget | undefined {
  if (PERF_BUDGETS[route]) return PERF_BUDGETS[route];
  for (const key of Object.keys(PERF_BUDGETS)) {
    if (route.startsWith(key)) return PERF_BUDGETS[key];
  }
  return undefined;
}
