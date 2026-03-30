import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { tenantKey } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

interface CascadeOptions {
  enabled?: boolean;
  onChange?: () => void;
  initialValues?: {
    clientId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
    subtaskId?: string | null;
  };
}

export function useTimeEntryCascade(options: CascadeOptions = {}) {
  const { enabled = true, onChange, initialValues } = options;

  const [clientId, setClientId] = useState<string | null>(initialValues?.clientId ?? null);
  const [projectId, setProjectId] = useState<string | null>(initialValues?.projectId ?? null);
  const [taskId, setTaskId] = useState<string | null>(initialValues?.taskId ?? null);
  const [subtaskId, setSubtaskId] = useState<string | null>(initialValues?.subtaskId ?? null);

  const { data: clients = [], isFetched: clientsFetched } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: tenantKey(queryKeys.clients.minimal),
    enabled,
  });

  const { data: clientProjects = [], isFetched: projectsFetched } = useQuery<Array<{ id: string; name: string; clientId?: string | null }>>({
    queryKey: tenantKey(queryKeys.clients.projects(clientId!)),
    queryFn: () => fetch(`/api/clients/${clientId}/projects`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId && enabled,
  });

  const { data: projectTasks = [] } = useQuery<Array<{ id: string; title: string; parentTaskId: string | null; status: string }>>({
    queryKey: tenantKey(queryKeys.projects.tasks(projectId!)),
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!projectId && enabled,
  });

  const openTasks = projectTasks.filter((t) => t.status !== "done" && !t.parentTaskId);
  const subtasks = projectTasks.filter((t) => t.parentTaskId === taskId && t.status !== "done");
  const hasSubtasks = subtasks.length > 0;
  const finalTaskId = subtaskId || taskId;

  const handleClientChange = useCallback((newClientId: string | null) => {
    setClientId(newClientId);
    setProjectId(null);
    setTaskId(null);
    setSubtaskId(null);
    onChange?.();
  }, [onChange]);

  const handleProjectChange = useCallback((newProjectId: string | null) => {
    setProjectId(newProjectId);
    setTaskId(null);
    setSubtaskId(null);
    onChange?.();
  }, [onChange]);

  const handleTaskChange = useCallback((newTaskId: string | null) => {
    setTaskId(newTaskId);
    setSubtaskId(null);
    onChange?.();
  }, [onChange]);

  const handleSubtaskChange = useCallback((newSubtaskId: string | null) => {
    setSubtaskId(newSubtaskId);
    onChange?.();
  }, [onChange]);

  const resetAll = useCallback((values?: { clientId?: string | null; projectId?: string | null; taskId?: string | null; subtaskId?: string | null }) => {
    setClientId(values?.clientId ?? null);
    setProjectId(values?.projectId ?? null);
    setTaskId(values?.taskId ?? null);
    setSubtaskId(values?.subtaskId ?? null);
  }, []);

  return {
    clientId,
    projectId,
    taskId,
    subtaskId,
    clients,
    clientsFetched,
    clientProjects,
    projectsFetched,
    projectTasks,
    openTasks,
    subtasks,
    hasSubtasks,
    finalTaskId,
    handleClientChange,
    handleProjectChange,
    handleTaskChange,
    handleSubtaskChange,
    resetAll,
  };
}
