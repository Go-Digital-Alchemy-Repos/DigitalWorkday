export interface QuickStartTimerPayload {
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  subtaskId?: string | null;
  title?: string;
  description: null;
}

export interface StopTimerPayload {
  scope: "in_scope";
  title: string | null;
  description: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  subtaskId?: string | null;
}

export function buildTaskQuickStartTimerPayload(params: {
  clientId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  title?: string | null;
}): QuickStartTimerPayload {
  return {
    clientId: params.clientId ?? null,
    projectId: params.projectId ?? null,
    taskId: params.taskId ?? null,
    title: params.title || undefined,
    description: null,
  };
}

export function buildSubtaskQuickStartTimerPayload(params: {
  clientId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  subtaskId?: string | null;
  title?: string | null;
}): QuickStartTimerPayload {
  return {
    clientId: params.clientId ?? null,
    projectId: params.projectId ?? null,
    taskId: params.taskId ?? null,
    subtaskId: params.subtaskId ?? null,
    title: params.title || undefined,
    description: null,
  };
}

export function buildStopTimerPayload(params: {
  title?: string | null;
  description: string;
  clientId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  subtaskId?: string | null;
}): StopTimerPayload {
  return {
    scope: "in_scope",
    title: params.title || null,
    description: params.description,
    clientId: params.clientId ?? null,
    projectId: params.projectId ?? null,
    taskId: params.taskId ?? null,
    subtaskId: params.subtaskId ?? null,
  };
}
