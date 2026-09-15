import { describe, expect, it } from "vitest";

import {
  CREATE_NEW_PROJECT_VALUE,
  getCreatedProjectSelection,
} from "@/lib/task-create-project";

describe("task drawer project creation", () => {
  it("uses a reserved dropdown action value", () => {
    expect(CREATE_NEW_PROJECT_VALUE).toBe("__create_new_project__");
  });

  it("selects the new project and synchronizes its client", () => {
    expect(
      getCreatedProjectSelection({ id: "project-new", clientId: "client-selected" }),
    ).toEqual({
      projectId: "project-new",
      clientId: "client-selected",
    });
  });
});
