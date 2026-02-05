import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface PrefetchOptions {
  staleTime?: number;
  delay?: number;
}

export function usePrefetchTask() {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prefetch = useCallback((taskId: string, options: PrefetchOptions = {}) => {
    const { staleTime = 30000, delay = 100 } = options;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["/api/tasks", taskId],
        staleTime,
      });
    }, delay);
  }, [queryClient]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { prefetch, cancel };
}

export function usePrefetchProject() {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prefetch = useCallback((projectId: string, options: PrefetchOptions = {}) => {
    const { staleTime = 30000, delay = 100 } = options;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["/api/projects", projectId],
        staleTime,
      });
    }, delay);
  }, [queryClient]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { prefetch, cancel };
}

export function usePrefetchClient() {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prefetch = useCallback((clientId: string, options: PrefetchOptions = {}) => {
    const { staleTime = 30000, delay = 100 } = options;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["/api/clients", clientId],
        staleTime,
      });
    }, delay);
  }, [queryClient]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { prefetch, cancel };
}
