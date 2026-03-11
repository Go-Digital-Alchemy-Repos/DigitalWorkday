// ─────────────────────────────────────────────────────────────────────────────
// useTourApi — TanStack Query hooks for guided tour backend API
// Follows the app's existing fetch/mutation conventions from queryClient.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UserGuidedTourPreferences, UserGuidedTourProgress } from "@shared/schema";

// ── Query keys ────────────────────────────────────────────────────────────────

export const TOUR_QUERY_KEYS = {
  preferences: ["/api/guided-tours/preferences"] as const,
  progress: ["/api/guided-tours/progress"] as const,
  progressForKey: (tourKey: string) => ["/api/guided-tours/progress", tourKey] as const,
};

// ── Preferences ───────────────────────────────────────────────────────────────

export interface TourPreferencesResponse {
  toursEnabled: boolean;
  contextualHintsEnabled: boolean;
  onboardingCompleted: boolean;
  lastSeenReleaseTourVersion: string | null;
}

export function useTourPreferences(opts?: { enabled?: boolean }) {
  return useQuery<TourPreferencesResponse>({
    queryKey: TOUR_QUERY_KEYS.preferences,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    enabled: opts?.enabled ?? true,
    // Default to safe values if API is unavailable
    placeholderData: {
      toursEnabled: true,
      contextualHintsEnabled: true,
      onboardingCompleted: false,
      lastSeenReleaseTourVersion: null,
    },
  });
}

export function useUpdateTourPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<TourPreferencesResponse>) =>
      apiRequest("PATCH", "/api/guided-tours/preferences", prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOUR_QUERY_KEYS.preferences });
    },
  });
}

// ── Progress ──────────────────────────────────────────────────────────────────

export function useTourProgressList(opts?: { enabled?: boolean }) {
  return useQuery<UserGuidedTourProgress[]>({
    queryKey: TOUR_QUERY_KEYS.progress,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: opts?.enabled ?? true,
    placeholderData: [],
  });
}

export function useUpdateTourProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tourKey, data }: {
      tourKey: string;
      data: {
        status?: "not_started" | "in_progress" | "completed" | "dismissed";
        currentStepIndex?: number;
        tourVersion?: number;
      };
    }) => apiRequest("PUT", `/api/guided-tours/progress/${tourKey}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOUR_QUERY_KEYS.progress });
    },
  });
}

export function useCompleteTour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tourKey, tourVersion }: { tourKey: string; tourVersion?: number }) =>
      apiRequest("POST", `/api/guided-tours/progress/${tourKey}/complete`, { tourVersion: tourVersion ?? 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOUR_QUERY_KEYS.progress });
    },
  });
}

export function useDismissTour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tourKey, tourVersion, currentStepIndex }: {
      tourKey: string;
      tourVersion?: number;
      currentStepIndex?: number;
    }) => apiRequest("POST", `/api/guided-tours/progress/${tourKey}/dismiss`, {
      tourVersion: tourVersion ?? 1,
      currentStepIndex: currentStepIndex ?? 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOUR_QUERY_KEYS.progress });
    },
  });
}

export function useResetTour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tourKey: string) =>
      apiRequest("POST", `/api/guided-tours/progress/${tourKey}/reset`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOUR_QUERY_KEYS.progress });
    },
  });
}
