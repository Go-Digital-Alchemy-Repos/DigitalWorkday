import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatReviewQueueTimestamp,
  ReviewQueueRow,
  type DashboardReviewQueueItem,
} from "@/components/review-queue-card";
import { TooltipProvider } from "@/components/ui/tooltip";

const baseItem: DashboardReviewQueueItem = {
  id: "task_1",
  type: "task",
  title: "Design review",
  status: "in_review",
  projectId: "project_1",
  projectName: "2026 build",
  clientId: "client_1",
  clientName: "Tandem Spirits",
  taskId: "task_1",
  taskTitle: "Design review",
  priority: "high",
  dueDate: null,
  estimateMinutes: 30,
  submittedAt: "2026-05-07T13:00:00",
  updatedAt: "2026-05-07T13:00:00",
  assignees: [
    {
      id: "user_1",
      name: "Amiel Fuentes",
      email: "amiel@example.com",
    },
  ],
};

function renderReviewRow(item: DashboardReviewQueueItem, mode: "pending" | "cleared" = "pending") {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ReviewQueueRow
        item={item}
        mode={mode}
        onOpen={() => undefined}
        onApprove={() => undefined}
      />
    </TooltipProvider>,
  );
}

describe("ReviewQueueRow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders distinct project and client context badges", () => {
    const markup = renderReviewRow(baseItem);

    expect(markup).toContain('data-context-badge-kind="project"');
    expect(markup).toContain('data-context-badge-kind="client"');
    expect(markup).toContain('aria-label="Project: 2026 build"');
    expect(markup).toContain('aria-label="Client: Tandem Spirits"');
    expect(markup).toContain('data-tooltip-label="Project"');
    expect(markup).toContain('data-tooltip-label="Client"');
  });

  it("labels pending timestamps as sent for review", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T15:00:00"));

    const timestamp = formatReviewQueueTimestamp(baseItem.submittedAt, "pending");

    expect(timestamp?.label).toContain("Sent for review");
    expect(timestamp?.label).toContain("ago");
    expect(timestamp?.tooltip).toContain("Sent for review at");
  });

  it("labels cleared timestamps as approved", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T15:00:00"));

    const timestamp = formatReviewQueueTimestamp("2026-05-07T14:30:00", "cleared");

    expect(timestamp?.label).toBe("Approved 30 minutes ago");
    expect(timestamp?.tooltip).toContain("Approved at");
  });

  it("adds assignee context without changing the visible assignment text", () => {
    const markup = renderReviewRow(baseItem);

    expect(markup).toContain("Assigned to Amiel Fuentes");
    expect(markup).toContain('data-tooltip-label="Current assignee(s)"');
    expect(markup).toContain('aria-label="Current assignee(s): Amiel Fuentes"');
  });
});
