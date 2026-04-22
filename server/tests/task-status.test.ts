import { describe, expect, it } from "vitest";
import {
  getTaskStatusLabel,
  isTaskDoneStatus,
  isTaskReviewStatus,
  normalizeTaskStatus,
} from "@shared/taskStatus";

describe("task status normalization", () => {
  it("normalizes legacy aliases to canonical statuses", () => {
    expect(normalizeTaskStatus("review")).toBe("in_review");
    expect(normalizeTaskStatus("completed")).toBe("done");
  });

  it("identifies review and done states consistently", () => {
    expect(isTaskReviewStatus("review")).toBe(true);
    expect(isTaskReviewStatus("in_review")).toBe(true);
    expect(isTaskDoneStatus("completed")).toBe(true);
    expect(isTaskDoneStatus("done")).toBe(true);
  });

  it("returns friendly labels for canonical statuses", () => {
    expect(getTaskStatusLabel("review")).toBe("In Review");
    expect(getTaskStatusLabel("completed")).toBe("Done");
    expect(getTaskStatusLabel("blocked")).toBe("Blocked");
  });
});
