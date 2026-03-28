import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatErrorForToast } from "@/lib/parseApiError";
import { queryKeys, invalidateTaskCaches } from "@/lib/queryKeys";
import type { TaskWithRelations } from "@shared/schema";

export interface CreateTaskData {
  title: string;
  description?: string;
  projectId?: string;
  sectionId?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "todo" | "in_progress" | "blocked" | "done";
  dueDate?: string | null;
  personalSectionId?: string;
  assigneeIds?: string[];
  estimateMinutes?: number | null;
  isBillable?: boolean;
}

export interface CreatePersonalTaskData {
  title: string;
  description?: string;
  dueDate?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  assigneeIds?: string[];
  personalSectionId?: string;
}

export interface CreateChildTaskData {
  parentTaskId: string;
  title: string;
  assigneeId?: string;
}

export interface CreateSubtaskData {
  taskId: string;
  title: string;
}

export function useCreateTask(options?: { 
  onSuccess?: (task: TaskWithRelations) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateTaskData & { projectId: string }) => {
      const response = await apiRequest("POST", "/api/tasks", data);
      return response.json();
    },
    onMutate: async (data) => {
      const myTasksKey = queryKeys.tasks.my;
      await queryClient.cancelQueries({ queryKey: myTasksKey });
      const previousMyTasks = queryClient.getQueryData(myTasksKey);
      const optimisticTask = {
        id: `temp-${Date.now()}`,
        title: data.title,
        description: data.description || null,
        status: data.status || "todo",
        priority: data.priority || "medium",
        projectId: data.projectId,
        sectionId: data.sectionId || null,
        dueDate: data.dueDate || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assignees: [],
        tags: [],
        subtasks: [],
      };
      queryClient.setQueryData<Record<string, unknown>[]>(myTasksKey, (old = []) => [optimisticTask, ...old]);
      return { previousMyTasks };
    },
    onError: (error: Error, _data, context: { previousMyTasks?: unknown } | undefined) => {
      if (context?.previousMyTasks) {
        queryClient.setQueryData(queryKeys.tasks.my, context.previousMyTasks);
      }
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
    onSettled: (_data, _error, variables) => {
      invalidateTaskCaches(queryClient, { projectId: variables.projectId, includeProjectLists: true });
    },
    onSuccess: (task) => {
      options?.onSuccess?.(task);
    },
  });
}

export function useCreatePersonalTask(options?: { 
  onSuccess?: (task: TaskWithRelations) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreatePersonalTaskData) => {
      const response = await apiRequest("POST", "/api/tasks/personal", data);
      return response.json();
    },
    onSuccess: (task) => {
      invalidateTaskCaches(queryClient);
      options?.onSuccess?.(task);
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}

export function useCreateChildTask(options?: { 
  projectId?: string;
  onSuccess?: (task: TaskWithRelations) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ parentTaskId, title, assigneeId }: CreateChildTaskData) => {
      const response = await apiRequest("POST", `/api/tasks/${parentTaskId}/childtasks`, { 
        title, 
        assigneeId 
      });
      return response.json();
    },
    onSuccess: (task) => {
      invalidateTaskCaches(queryClient, {
        projectId: options?.projectId || task.projectId,
        parentTaskId: task.parentTaskId,
      });
      options?.onSuccess?.(task);
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}

export function useCreateSubtask(options?: { 
  projectId?: string;
  onSuccess?: (subtask: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ taskId, title }: CreateSubtaskData) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/subtasks`, { title });
      return response.json();
    },
    onSuccess: (subtask, variables) => {
      invalidateTaskCaches(queryClient, {
        projectId: options?.projectId || subtask.projectId,
        parentTaskId: variables.taskId,
      });
      options?.onSuccess?.(subtask);
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}
