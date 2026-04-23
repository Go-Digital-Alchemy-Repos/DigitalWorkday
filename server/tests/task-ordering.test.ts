import { describe, expect, it } from "vitest";
import { sortTasksOpenFirst, sortSectionsOpenFirst } from "../../client/src/features/tasks/taskOrdering";

describe("taskOrdering", () => {
  it("keeps open tasks above completed tasks while preserving relative order", () => {
    const tasks = [
      { id: "t1", status: "todo" },
      { id: "t2", status: "done" },
      { id: "t3", status: "in_progress" },
      { id: "t4", status: "done" },
      { id: "t5", status: "review" },
    ] as any;

    expect(sortTasksOpenFirst(tasks).map((task) => task.id)).toEqual(["t1", "t3", "t5", "t2", "t4"]);
  });

  it("sorts each section independently", () => {
    const sections = [
      {
        id: "s1",
        tasks: [
          { id: "a", status: "done" },
          { id: "b", status: "todo" },
        ],
      },
      {
        id: "s2",
        tasks: [
          { id: "c", status: "todo" },
          { id: "d", status: "done" },
        ],
      },
    ] as any;

    const sorted = sortSectionsOpenFirst(sections);
    expect(sorted[0].tasks.map((task: any) => task.id)).toEqual(["b", "a"]);
    expect(sorted[1].tasks.map((task: any) => task.id)).toEqual(["c", "d"]);
  });
});
