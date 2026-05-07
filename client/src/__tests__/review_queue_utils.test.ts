import { describe, expect, it } from "vitest";

import { applyApprovedReviewToDashboardQueue, buildApprovedReviewItem } from "@/components/reports/review-queue-utils";

const baseItem = {
  id: "task_1",
  type: "task" as const,
  title: "Ship review flow",
  status: "in_review",
  projectId: "project_1",
  projectName: "Ops",
  clientId: "client_1",
  clientName: "Acme",
  taskId: "task_1",
  taskTitle: "Ship review flow",
  priority: "high",
  dueDate: null,
  estimateMinutes: 60,
  submittedAt: "2026-04-24T12:00:00.000Z",
  updatedAt: "2026-04-24T12:00:00.000Z",
  assignees: [],
};

describe("review queue utils", () => {
  it("builds an approved review item with metadata", () => {
    const approved = buildApprovedReviewItem(
      baseItem,
      "Pat Manager",
      "2026-04-24T13:00:00.000Z",
    );

    expect(approved.status).toBe("in_progress");
    expect(approved.approvedAt).toBe("2026-04-24T13:00:00.000Z");
    expect(approved.updatedAt).toBe("2026-04-24T13:00:00.000Z");
    expect(approved.approverName).toBe("Pat Manager");
  });

  it("moves an approved item from pending to cleared", () => {
    const current = {
      items: [
        baseItem,
        { ...baseItem, id: "task_2", taskId: "task_2", title: "Keep me pending", taskTitle: "Keep me pending" },
      ],
      clearedItems: [
        { ...baseItem, id: "task_3", taskId: "task_3", title: "Already cleared", taskTitle: "Already cleared", status: "in_progress" },
      ],
    };

    const next = applyApprovedReviewToDashboardQueue(
      current,
      baseItem,
      "Pat Manager",
      "2026-04-24T13:00:00.000Z",
    );

    expect(next?.items.map((item) => item.id)).toEqual(["task_2"]);
    expect(next?.clearedItems[0]?.id).toBe("task_1");
    expect(next?.clearedItems[0]?.approverName).toBe("Pat Manager");
  });

  it("deduplicates existing cleared items when approving again", () => {
    const current = {
      items: [baseItem],
      clearedItems: [
        { ...baseItem, status: "in_progress", approverName: "Old Approver", approvedAt: "2026-04-24T11:00:00.000Z" },
      ],
    };

    const next = applyApprovedReviewToDashboardQueue(
      current,
      baseItem,
      "New Approver",
      "2026-04-24T13:00:00.000Z",
    );

    expect(next?.clearedItems).toHaveLength(1);
    expect(next?.clearedItems[0]?.approverName).toBe("New Approver");
    expect(next?.clearedItems[0]?.approvedAt).toBe("2026-04-24T13:00:00.000Z");
  });

  it("returns undefined unchanged when there is no queue data yet", () => {
    expect(
      applyApprovedReviewToDashboardQueue(
        undefined,
        baseItem,
        "Pat Manager",
        "2026-04-24T13:00:00.000Z",
      ),
    ).toBeUndefined();
  });
});
