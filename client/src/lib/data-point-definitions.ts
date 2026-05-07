export const DATA_POINT_DEFINITIONS = {
  activeTasks: "Open work that is currently assigned and not cancelled or archived.",
  assignees: "Current team member(s) responsible for this work.",
  billable: "Tracked time categorized as client-billable.",
  client: "Client associated with this project or task.",
  completionRate: "Completed work compared with total work in the selected scope.",
  dueDate: "The target date this work is expected to be completed.",
  efficiency: "Completed work compared with tracked effort.",
  estimate: "Planned effort for this work, measured in minutes.",
  healthScore: "Composite score based on delivery, workload, time tracking, and risk signals.",
  hoursTracked: "Total time entries recorded in the selected date range.",
  overdue: "Open work past its due date.",
  priority: "Relative urgency used to help the team sequence work.",
  project: "Project where this work is tracked.",
  riskFlags: "Generated warning signals that may need manager attention.",
  status: "Current workflow state for this work.",
  utilization: "Tracked hours compared with expected available hours.",
} as const;

export type DataPointDefinitionKey = keyof typeof DATA_POINT_DEFINITIONS;
