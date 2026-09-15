import type { Project } from "@shared/schema";

export const CREATE_NEW_PROJECT_VALUE = "__create_new_project__";

export function getCreatedProjectSelection(project: Pick<Project, "id" | "clientId">) {
  return {
    projectId: project.id,
    clientId: project.clientId || "",
  };
}
