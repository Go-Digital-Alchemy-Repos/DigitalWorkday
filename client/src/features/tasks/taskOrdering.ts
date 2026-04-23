import type { SectionWithTasks, TaskWithRelations } from "@shared/schema";

export function isTaskCompleted(task: Pick<TaskWithRelations, "status">): boolean {
  return task.status === "done";
}

export function sortTasksOpenFirst(tasks: TaskWithRelations[] | undefined): TaskWithRelations[] {
  if (!tasks || tasks.length <= 1) {
    return tasks ? [...tasks] : [];
  }

  const openTasks: TaskWithRelations[] = [];
  const completedTasks: TaskWithRelations[] = [];

  for (const task of tasks) {
    if (isTaskCompleted(task)) {
      completedTasks.push(task);
    } else {
      openTasks.push(task);
    }
  }

  return [...openTasks, ...completedTasks];
}

export function sortSectionsOpenFirst(
  sections: SectionWithTasks[] | null | undefined,
): SectionWithTasks[] {
  if (!sections) {
    return [];
  }

  return sections.map((section) => ({
    ...section,
    tasks: sortTasksOpenFirst(section.tasks || []),
  }));
}
