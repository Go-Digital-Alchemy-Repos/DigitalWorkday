import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest, tenantKey, STALE_TIMES } from "@/lib/queryClient";
import { queryKeys, invalidateTimeEntries, optimisticInsertTimeEntryBroad, type CachedTimeEntry } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";

export interface ActiveTimer {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  title: string | null;
  description: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; companyName: string } | null;
  project?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
}

export type TimerUIState = "idle" | "running" | "paused" | "stopping" | "error";

const BROADCAST_CHANNEL_NAME = "active-timer-sync";
const RUNNING_REFETCH_INTERVAL = 30000;
const PAUSED_REFETCH_INTERVAL = 60000;

export function useActiveTimer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const hasShownRecoveryToast = useRef(false);

  const isEligible = user && user.role !== "super_user";

  const timerQueryKey = tenantKey(queryKeys.timer.current);

  const {
    data: timer,
    isLoading,
    error,
    refetch,
  } = useQuery<ActiveTimer | null>({
    queryKey: timerQueryKey,
    enabled: !!isEligible,
    staleTime: STALE_TIMES.realtime,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  const invalidateTimer = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: timerQueryKey });
  }, [queryClient, timerQueryKey]);

  const broadcastTimerUpdate = useCallback((eventType: "timer-state-change" | "time-entry-changed" = "timer-state-change") => {
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "timer-updated", eventType });
      } catch {
      }
    }
    try {
      localStorage.setItem("timer-sync", JSON.stringify({ eventType, ts: Date.now() }));
      localStorage.removeItem("timer-sync");
    } catch {
    }
  }, []);

  useEffect(() => {
    if (!isEligible) return;

    try {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data?.type === "timer-updated") {
          invalidateTimer();
          if (event.data.eventType === "time-entry-changed") {
            invalidateTimeEntries(queryClient, {});
          }
        }
      };
    } catch {
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === "timer-sync") {
        invalidateTimer();
        try {
          const data = event.newValue ? JSON.parse(event.newValue) : {};
          if (data.eventType === "time-entry-changed") {
            invalidateTimeEntries(queryClient, {});
          }
        } catch {
          // ignore parse errors
        }
      }
    };
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      broadcastChannelRef.current?.close();
      broadcastChannelRef.current = null;
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [isEligible, invalidateTimer, queryClient]);

  useEffect(() => {
    if (!isEligible || !timer) return;

    const interval = timer.status === "running" 
      ? RUNNING_REFETCH_INTERVAL 
      : PAUSED_REFETCH_INTERVAL;

    const intervalId = setInterval(() => {
      refetch();
    }, interval);

    return () => clearInterval(intervalId);
  }, [isEligible, timer?.status, refetch]);

  useEffect(() => {
    if (timer && !hasShownRecoveryToast.current && !isLoading) {
      const sessionKey = `timer-recovered-${timer.id}`;
      const alreadyShown = sessionStorage.getItem(sessionKey);
      
      if (!alreadyShown) {
        toast({
          title: "Timer recovered",
          description: `Your ${timer.status === "running" ? "running" : "paused"} timer has been restored.`,
        });
        sessionStorage.setItem(sessionKey, "true");
      }
      hasShownRecoveryToast.current = true;
    }
  }, [timer, isLoading, toast]);

  const startMutation = useMutation({
    mutationFn: async (data: {
      clientId?: string | null;
      projectId?: string | null;
      taskId?: string | null;
      description?: string | null;
    }) => {
      const response = await apiRequest("POST", "/api/timer/start", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && errorData.error === "TIMER_ALREADY_RUNNING") {
          throw new Error("TIMER_ALREADY_RUNNING");
        }
        throw new Error(errorData.message || errorData.error || "Failed to start timer");
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error: Error) => {
      if (error.message === "TIMER_ALREADY_RUNNING") {
        toast({
          title: "Timer already running",
          description: "You already have an active timer. Stop it before starting a new one.",
          variant: "destructive",
        });
        invalidateTimer();
      } else {
        toast({
          title: "Failed to start timer",
          description: error.message || "Please try again",
          variant: "destructive",
        });
      }
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/timer/pause");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to pause timer";
        const requestId = errorData.requestId || response.headers.get("x-request-id");
        throw new Error(requestId ? `${errorMessage} (Ref: ${requestId})` : errorMessage);
      }
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: timerQueryKey });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>(timerQueryKey);
      
      if (previousTimer) {
        let newElapsedSeconds = previousTimer.elapsedSeconds;
        if (previousTimer.status === "running" && previousTimer.lastStartedAt) {
          const lastStarted = new Date(previousTimer.lastStartedAt).getTime();
          const now = Date.now();
          newElapsedSeconds += Math.floor((now - lastStarted) / 1000);
        }
        
        queryClient.setQueryData<ActiveTimer | null>(timerQueryKey, {
          ...previousTimer,
          status: "paused",
          elapsedSeconds: newElapsedSeconds,
        });
      }
      return { previousTimer };
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData(timerQueryKey, context.previousTimer);
      }
      toast({
        title: "Failed to pause timer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/timer/resume");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to resume timer";
        const requestId = errorData.requestId || response.headers.get("x-request-id");
        throw new Error(requestId ? `${errorMessage} (Ref: ${requestId})` : errorMessage);
      }
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: timerQueryKey });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>(timerQueryKey);
      
      if (previousTimer) {
        queryClient.setQueryData<ActiveTimer | null>(timerQueryKey, {
          ...previousTimer,
          status: "running",
          lastStartedAt: new Date().toISOString(),
        });
      }
      return { previousTimer };
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData(timerQueryKey, context.previousTimer);
      }
      toast({
        title: "Failed to resume timer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (data: {
      clientId?: string | null;
      projectId?: string | null;
      taskId?: string | null;
      title?: string | null;
      description?: string | null;
      scope?: string;
      discard?: boolean;
    }) => {
      const response = await apiRequest("POST", "/api/timer/stop", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to save time entry";
        const requestId = errorData.requestId || response.headers.get("x-request-id");
        throw new Error(requestId ? `${errorMessage} (Ref: ${requestId})` : errorMessage);
      }
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: timerQueryKey });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>(timerQueryKey);
      queryClient.setQueryData<ActiveTimer | null>(timerQueryKey, null);
      return { previousTimer };
    },
    onSuccess: (responseData, variables) => {
      invalidateTimer();
      if (!variables?.discard) {
        if (responseData && responseData.id) {
          const entry: CachedTimeEntry = {
            id: responseData.id,
            workspaceId: responseData.workspaceId ?? "",
            userId: responseData.userId ?? "",
            clientId: responseData.clientId ?? null,
            projectId: responseData.projectId ?? null,
            taskId: responseData.taskId ?? null,
            title: responseData.title ?? null,
            description: responseData.description ?? null,
            startTime: responseData.startTime ?? new Date().toISOString(),
            endTime: responseData.endTime ?? null,
            durationSeconds: responseData.durationSeconds ?? 0,
            scope: responseData.scope ?? "in_scope",
            isManual: false,
            createdAt: responseData.createdAt ?? new Date().toISOString(),
          };
          optimisticInsertTimeEntryBroad(queryClient, entry);
        }
        invalidateTimeEntries(queryClient, {});
        broadcastTimerUpdate("time-entry-changed");
      } else {
        broadcastTimerUpdate();
      }
    },
    onError: (error: Error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData(timerQueryKey, context.previousTimer);
      }
      toast({
        title: "Failed to save time entry",
        description: error.message || "Please try again. Your timer is still active.",
        variant: "destructive",
        duration: 10000,
      });
      invalidateTimer();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/timer/current");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to discard timer";
        const requestId = errorData.requestId || response.headers.get("x-request-id");
        throw new Error(requestId ? `${errorMessage} (Ref: ${requestId})` : errorMessage);
      }
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: timerQueryKey });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>(timerQueryKey);
      queryClient.setQueryData<ActiveTimer | null>(timerQueryKey, null);
      return { previousTimer };
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error: Error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData(timerQueryKey, context.previousTimer);
      }
      toast({
        title: "Failed to discard timer",
        description: error.message || "Please try again",
        variant: "destructive",
        duration: 10000,
      });
      invalidateTimer();
    },
  });

  const computeUIState = (): TimerUIState => {
    if (stopMutation.isPending || deleteMutation.isPending) return "stopping";
    if (error || stopMutation.isError) return "error";
    if (!timer) return "idle";
    if (timer.status === "running") return "running";
    if (timer.status === "paused") return "paused";
    return "idle";
  };

  const uiState = computeUIState();

  return {
    timer,
    isLoading,
    error,
    uiState,
    hasActiveTimer: !!timer,
    isRunning: timer?.status === "running",
    isPaused: timer?.status === "paused",
    isStopping: stopMutation.isPending || deleteMutation.isPending,
    hasError: !!error || stopMutation.isError,
    refetch,
    invalidateTimer,
    broadcastTimerUpdate,
    startMutation,
    pauseMutation,
    resumeMutation,
    stopMutation,
    deleteMutation,
  };
}
