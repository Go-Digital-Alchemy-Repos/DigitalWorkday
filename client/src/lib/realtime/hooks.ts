import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, joinProjectRoom, leaveProjectRoom } from "./socket";
import type { ServerToClientEvents } from "@shared/events";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/lib/auth";

function patchTaskInSections(
  sections: unknown,
  taskId: string,
  updater: (task: any) => any,
) {
  if (!Array.isArray(sections)) return sections;
  return sections.map((section: any) => ({
    ...section,
    tasks: Array.isArray(section.tasks)
      ? section.tasks.map((task: any) => (task.id === taskId ? updater(task) : task))
      : section.tasks,
  }));
}

function patchTaskInList(
  tasks: unknown,
  taskId: string,
  updater: (task: any) => any,
) {
  if (!Array.isArray(tasks)) return tasks;
  return tasks.map((task: any) => (task.id === taskId ? updater(task) : task));
}

function patchSubtaskInTask(task: any, subtaskId: string, updater: (subtask: any) => any) {
  if (!task || !Array.isArray(task.subtasks)) return task;
  return {
    ...task,
    subtasks: task.subtasks.map((subtask: any) =>
      subtask.id === subtaskId ? updater(subtask) : subtask,
    ),
  };
}

function invalidateProjectViews(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  refetchType: "active" | "inactive" | "all" | "none" = "active",
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.sections(projectId), refetchType });
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.tasks(projectId), refetchType });
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.calendarEvents(projectId), refetchType });
}

function invalidateParentTask(
  queryClient: ReturnType<typeof useQueryClient>,
  parentTaskId: string | null | undefined,
  refetchType: "active" | "inactive" | "all" | "none" = "active",
) {
  if (!parentTaskId) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(parentTaskId), refetchType });
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.childTasks(parentTaskId), refetchType });
}

export function useProjectSocket(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  const currentProjectId = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const socket = getSocket();

    if (currentProjectId.current !== projectId) {
      if (currentProjectId.current) {
        leaveProjectRoom(currentProjectId.current);
      }
      joinProjectRoom(projectId);
      currentProjectId.current = projectId;
    }

    const handleProjectUpdated: ServerToClientEvents["project:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      }
    };

    const handleSectionCreated: ServerToClientEvents["section:created"] = (payload) => {
      if (payload.section.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sections(projectId) });
      }
    };

    const handleSectionUpdated: ServerToClientEvents["section:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sections(projectId) });
      }
    };

    const handleSectionDeleted: ServerToClientEvents["section:deleted"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sections(projectId) });
      }
    };

    const handleSectionReordered: ServerToClientEvents["section:reordered"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sections(projectId) });
      }
    };

    const handleTaskCreated: ServerToClientEvents["task:created"] = (payload) => {
      if (payload.projectId === projectId) {
        invalidateProjectViews(queryClient, projectId);
        invalidateParentTask(queryClient, payload.task.parentTaskId);
      }
    };

    const handleTaskUpdated: ServerToClientEvents["task:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.setQueryData(queryKeys.tasks.detail(payload.taskId), (current: any) =>
          current ? { ...current, ...payload.updates } : current,
        );
        queryClient.setQueryData(queryKeys.projects.tasks(projectId), (current: any) =>
          patchTaskInList(current, payload.taskId, (task) => ({ ...task, ...payload.updates })),
        );
        queryClient.setQueryData(queryKeys.projects.sections(projectId), (current: any) =>
          patchTaskInSections(current, payload.taskId, (task) => ({ ...task, ...payload.updates })),
        );
        invalidateProjectViews(queryClient, projectId, "inactive");
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(payload.taskId), refetchType: "inactive" });
        invalidateParentTask(queryClient, payload.parentTaskId, "inactive");
      }
    };

    const handleTaskDeleted: ServerToClientEvents["task:deleted"] = (payload) => {
      if (payload.projectId === projectId) {
        invalidateProjectViews(queryClient, projectId);
        invalidateParentTask(queryClient, payload.parentTaskId);
      }
    };

    const handleTaskMoved: ServerToClientEvents["task:moved"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sections(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.tasks(projectId) });
      }
    };

    const handleTaskReordered: ServerToClientEvents["task:reordered"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.sections(projectId) });
      }
    };

    const handleSubtaskCreated: ServerToClientEvents["subtask:created"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(payload.taskId), refetchType: "inactive" });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(payload.taskId), refetchType: "inactive" });
      }
    };

    const handleSubtaskUpdated: ServerToClientEvents["subtask:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.setQueryData(queryKeys.tasks.detail(payload.taskId), (current: any) =>
          patchSubtaskInTask(current, payload.subtaskId, (subtask) => ({
            ...subtask,
            ...payload.updates,
          })),
        );
        queryClient.setQueryData(queryKeys.projects.tasks(projectId), (current: any) =>
          patchTaskInList(current, payload.taskId, (task) =>
            patchSubtaskInTask(task, payload.subtaskId, (subtask) => ({
              ...subtask,
              ...payload.updates,
            })),
          ),
        );
        queryClient.setQueryData(queryKeys.projects.sections(projectId), (current: any) =>
          patchTaskInSections(current, payload.taskId, (task) =>
            patchSubtaskInTask(task, payload.subtaskId, (subtask) => ({
              ...subtask,
              ...payload.updates,
            })),
          ),
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(payload.taskId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(payload.taskId) });
      }
    };

    const handleSubtaskDeleted: ServerToClientEvents["subtask:deleted"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(payload.taskId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(payload.taskId) });
      }
    };

    const handleSubtaskReordered: ServerToClientEvents["subtask:reordered"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(payload.taskId) });
      }
    };

    const handleAttachmentAdded: ServerToClientEvents["attachment:added"] = (payload) => {
      if (payload.projectId === projectId && payload.taskId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.attachments(projectId!, payload.taskId) });
      }
    };

    const handleAttachmentDeleted: ServerToClientEvents["attachment:deleted"] = (payload) => {
      if (payload.projectId === projectId && payload.taskId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.attachments(projectId!, payload.taskId) });
      }
    };

    socket.on("project:updated", handleProjectUpdated);
    socket.on("section:created", handleSectionCreated);
    socket.on("section:updated", handleSectionUpdated);
    socket.on("section:deleted", handleSectionDeleted);
    socket.on("section:reordered", handleSectionReordered);
    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:deleted", handleTaskDeleted);
    socket.on("task:moved", handleTaskMoved);
    socket.on("task:reordered", handleTaskReordered);
    socket.on("subtask:created", handleSubtaskCreated);
    socket.on("subtask:updated", handleSubtaskUpdated);
    socket.on("subtask:deleted", handleSubtaskDeleted);
    socket.on("subtask:reordered", handleSubtaskReordered);
    socket.on("attachment:added", handleAttachmentAdded);
    socket.on("attachment:deleted", handleAttachmentDeleted);

    return () => {
      socket.off("project:updated", handleProjectUpdated);
      socket.off("section:created", handleSectionCreated);
      socket.off("section:updated", handleSectionUpdated);
      socket.off("section:deleted", handleSectionDeleted);
      socket.off("section:reordered", handleSectionReordered);
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:deleted", handleTaskDeleted);
      socket.off("task:moved", handleTaskMoved);
      socket.off("task:reordered", handleTaskReordered);
      socket.off("subtask:created", handleSubtaskCreated);
      socket.off("subtask:updated", handleSubtaskUpdated);
      socket.off("subtask:deleted", handleSubtaskDeleted);
      socket.off("subtask:reordered", handleSubtaskReordered);
      socket.off("attachment:added", handleAttachmentAdded);
      socket.off("attachment:deleted", handleAttachmentDeleted);

      if (currentProjectId.current) {
        leaveProjectRoom(currentProjectId.current);
        currentProjectId.current = null;
      }
    };
  }, [projectId, queryClient]);
}

export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const wrappedHandler = (...args: Parameters<ServerToClientEvents[E]>) => {
      (handlerRef.current as Function)(...args);
    };

    socket.on(event, wrappedHandler as any);

    return () => {
      socket.off(event, wrappedHandler as any);
    };
  }, [event]);
}

type WorkspaceRealtimeOptions = {
  enableMyTasks?: boolean;
  enableDashboard?: boolean;
  enableTimer?: boolean;
};

export function useWorkspaceRealtime({
  enableMyTasks = false,
  enableDashboard = false,
  enableTimer = false,
}: WorkspaceRealtimeOptions = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const refreshMyTasks = useCallback(() => {
    if (!enableMyTasks) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.my });
  }, [enableMyTasks, queryClient]);

  const refreshDashboard = useCallback(() => {
    if (!enableDashboard) return;
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/review-queue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/overdue-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/projects/analytics/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
  }, [enableDashboard, queryClient]);

  const refreshTimer = useCallback(() => {
    if (!enableTimer) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.timer.current });
    queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.myStats });
    queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
  }, [enableTimer, queryClient]);

  useSocketEvent("task:created", () => {
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("task:updated", (payload) => {
    if (enableMyTasks) {
      queryClient.setQueryData(queryKeys.tasks.my, (current: any) =>
        patchTaskInList(current, payload.taskId, (task) => ({ ...task, ...payload.updates })),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(payload.taskId), refetchType: "inactive" });
    }
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("task:deleted", () => {
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("subtask:created", () => {
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("subtask:updated", (payload) => {
    if (enableMyTasks) {
      queryClient.setQueryData(queryKeys.tasks.my, (current: any) =>
        patchTaskInList(current, payload.taskId, (task) =>
          patchSubtaskInTask(task, payload.subtaskId, (subtask) => ({
            ...subtask,
            ...payload.updates,
          })),
        ),
      );
    }
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("subtask:deleted", () => {
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("myTask:created", (payload) => {
    if (payload.userId !== currentUserId) return;
    if (enableMyTasks) {
      queryClient.setQueryData(queryKeys.tasks.my, (current: any[] = []) => {
        if (current.some((task) => task.id === payload.task.id)) return current;
        return [payload.task, ...current];
      });
    }
    refreshMyTasks();
  });

  useSocketEvent("myTask:updated", (payload) => {
    if (payload.userId !== currentUserId) return;
    if (enableMyTasks) {
      queryClient.setQueryData(queryKeys.tasks.my, (current: any) =>
        patchTaskInList(current, payload.taskId, (task) => ({ ...task, ...payload.updates })),
      );
    }
    refreshMyTasks();
  });

  useSocketEvent("myTask:deleted", (payload) => {
    if (payload.userId !== currentUserId) return;
    if (enableMyTasks) {
      queryClient.setQueryData(queryKeys.tasks.my, (current: any[] = []) =>
        current.filter((task) => task.id !== payload.taskId),
      );
    }
    refreshMyTasks();
  });

  useSocketEvent("timer:started", () => {
    refreshTimer();
    refreshMyTasks();
  });

  useSocketEvent("timer:paused", refreshTimer);
  useSocketEvent("timer:resumed", refreshTimer);

  useSocketEvent("timer:stopped", () => {
    refreshTimer();
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("timeEntry:created", () => {
    refreshTimer();
    refreshMyTasks();
    refreshDashboard();
  });

  useSocketEvent("timeEntry:updated", refreshTimer);
  useSocketEvent("timeEntry:deleted", refreshTimer);
}
