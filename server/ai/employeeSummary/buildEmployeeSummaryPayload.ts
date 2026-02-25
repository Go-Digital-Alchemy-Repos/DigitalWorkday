import crypto from "crypto";

export interface EmployeeSummaryPayload {
  employee: {
    id: string;
    displayName: string;
    role: string;
    team: string | null;
  };
  range: {
    start: string;
    end: string;
    days: number;
  };
  summary: {
    epi: {
      current: number;
      tier: string;
    };
    utilizationPct: number;
    capacityUsagePct: number;
    time: {
      totalHours: number;
      avgHoursPerDay: number;
      varianceHours: number;
    };
    tasks: {
      active: number;
      completed: number;
      overdue: number;
      dueSoon: number;
      backlog: number;
      completionRatePct: number;
      overdueRatePct: number;
      avgCompletionDays: number | null;
    };
    capacity: {
      weeksOverAllocated: number;
      maxUtilizationPct: number;
    };
    riskLevel: string;
    riskFlags: string[];
  };
  weeklyCapacity: Array<{
    week: string;
    plannedHours: number;
    actualHours: number;
    utilizationPct: number;
    overAllocated: boolean;
  }>;
  taskBreakdown: {
    byStatus: Array<{ label: string; value: number }>;
    byPriority: Array<{ label: string; value: number }>;
    topProjects: Array<{ label: string; value: number }>;
  };
}

export function buildEmployeeSummaryPayload(
  profileData: any,
  startDate: Date,
  endDate: Date
): EmployeeSummaryPayload {
  const days = Math.max(
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
    1
  );

  const weeks = profileData.capacity?.weeklyData ?? [];
  const weeksOverAllocated = weeks.filter((w: any) => w.overAllocated).length;
  const maxUtilizationPct = weeks.reduce((max: number, w: any) => Math.max(max, w.utilization ?? 0), 0);

  return {
    employee: {
      id: profileData.employee.id,
      displayName: profileData.employee.name,
      role: profileData.employee.role,
      team: profileData.employee.team ?? null,
    },
    range: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
      days,
    },
    summary: {
      epi: {
        current: profileData.summary.performanceScore ?? 0,
        tier: profileData.summary.performanceTier ?? "Stable",
      },
      utilizationPct: profileData.summary.utilization ?? 0,
      capacityUsagePct: profileData.summary.capacityUsage ?? 0,
      time: {
        totalHours: profileData.timeTracking.totalHours ?? 0,
        avgHoursPerDay: profileData.timeTracking.avgHoursPerDay ?? 0,
        varianceHours: profileData.timeTracking.variance ?? 0,
      },
      tasks: {
        active: profileData.workload.activeTasks ?? 0,
        completed: profileData.workload.completedInRange ?? 0,
        overdue: profileData.workload.overdueTasks ?? 0,
        dueSoon: profileData.workload.dueSoon ?? 0,
        backlog: profileData.workload.backlog ?? 0,
        completionRatePct: profileData.summary.completionRate ?? 0,
        overdueRatePct: profileData.summary.overdueRate ?? 0,
        avgCompletionDays: profileData.workload.avgCompletionDays ?? null,
      },
      capacity: {
        weeksOverAllocated,
        maxUtilizationPct,
      },
      riskLevel: profileData.summary.riskLevel ?? "Healthy",
      riskFlags: (profileData.riskIndicators ?? []).map((r: any) => r.description),
    },
    weeklyCapacity: weeks.map((w: any) => ({
      week: w.week,
      plannedHours: w.plannedHours,
      actualHours: w.actualHours,
      utilizationPct: w.utilization,
      overAllocated: w.overAllocated,
    })),
    taskBreakdown: {
      byStatus: profileData.taskBreakdown?.byStatus ?? [],
      byPriority: profileData.taskBreakdown?.byPriority ?? [],
      topProjects: (profileData.taskBreakdown?.byProject ?? []).slice(0, 5),
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value as object).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify((value as any)[k])).join(",") + "}";
}

export function hashPayload(payload: EmployeeSummaryPayload): string {
  const stable = stableStringify(payload);
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 32);
}
