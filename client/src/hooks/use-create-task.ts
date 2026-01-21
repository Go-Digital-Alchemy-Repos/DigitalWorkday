import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface CreateTaskData {
  title: string;
  description?: string;
  projectId?: string;
  sectionId?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "todo" | "in_progress" | "blocked" | "done";
  dueDate?: string | null;
  personalSectionId?: string;
}

export interface CreatePersonalTaskData {
  title: string;
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

function invalidateAllTaskCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId?: string | null
) {
  queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
  queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
  }
  
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === "/api/projects" && key[2] === "sections";
    }
  });
}

export function useCreateTask(options?: { 
  onSuccess?: (task: any) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateTaskData & { projectId: string }) => {
      const response = await apiRequest("POST", "/api/tasks", data);
      return response.json();
    },
    onSuccess: (task) => {
      invalidateAllTaskCaches(queryClient, task.projectId);
      options?.onSuccess?.(task);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}

export function useCreatePersonalTask(options?: { 
  onSuccess?: (task: any) => void;
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
      invalidateAllTaskCaches(queryClient, null);
      options?.onSuccess?.(task);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create personal task",
        description: error.message,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}

export function useCreateChildTask(options?: { 
  projectId?: string;
  onSuccess?: (task: any) => void;
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
      invalidateAllTaskCaches(queryClient, options?.projectId || task.projectId);
      
      if (task.parentTaskId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.parentTaskId, "childtasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.parentTaskId] });
      }
      options?.onSuccess?.(task);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create subtask",
        description: error.message,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}

export function useCreateSubtask(options?: { 
  onSuccess?: (subtask: any) => void;
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
      invalidateAllTaskCaches(queryClient, null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", variables.taskId, "subtasks"] });
      options?.onSuccess?.(subtask);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create subtask",
        description: error.message,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}
