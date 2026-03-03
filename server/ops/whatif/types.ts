export interface WhatIfReassignment {
  taskId: string;
  toUserId: string;
}

export interface WhatIfDueDateChange {
  taskId: string;
  newDueDate: string;
}

export interface WhatIfEstimateChange {
  taskId: string;
  newEstimateHours: number;
}

export interface WhatIfChanges {
  reassign?: WhatIfReassignment[];
  moveDueDate?: WhatIfDueDateChange[];
  adjustEstimateHours?: WhatIfEstimateChange[];
}

export interface WhatIfInput {
  tenantId: string;
  projectId: string;
  rangeStart: string;
  rangeEnd: string;
  changes: WhatIfChanges;
}

export interface UserUtilization {
  userId: string;
  userName: string;
  utilizationPct: number;
  hoursPlanned: number;
}

export interface ProjectRisk {
  level: "stable" | "at_risk" | "critical";
  drivers: string[];
}

export interface BurnSnapshot {
  percentConsumed: number;
  loggedHours: number;
  budgetHours: number;
  projectedFinalHours: number;
  predictedOverrunDate: string | null;
}

export interface WhatIfStateSnapshot {
  utilizationByUser: UserUtilization[];
  projectRisk: ProjectRisk;
  burn: BurnSnapshot | null;
}

export interface UtilizationShift {
  userId: string;
  userName: string;
  deltaUtilizationPct: number;
  before: number;
  after: number;
}

export interface WhatIfDelta {
  utilizationShift: UtilizationShift[];
  riskDelta: { from: ProjectRisk["level"]; to: ProjectRisk["level"] };
  burnDelta: { projectedFinalHoursDelta: number } | null;
}

export interface WhatIfOutput {
  projectId: string;
  projectName: string;
  rangeStart: string;
  rangeEnd: string;
  before: WhatIfStateSnapshot;
  after: WhatIfStateSnapshot;
  delta: WhatIfDelta;
  appliedChanges: {
    reassignments: number;
    dueDateMoves: number;
    estimateAdjustments: number;
  };
}
