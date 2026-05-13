import { useCallback } from "react";
import { useLocation } from "wouter";

export function useBackNavigation(fallbackPath: string) {
  const [, setLocation] = useLocation();

  return useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    setLocation(fallbackPath);
  }, [fallbackPath, setLocation]);
}
