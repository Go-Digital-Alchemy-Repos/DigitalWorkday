// Mobile UX Phase 3C improvements applied here
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActiveTimer } from "@/hooks/use-active-timer";
import { Clock, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveTimer = {
  id: string;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string | null;
  projectId: string | null;
  taskId: string | null;
  project?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
  client?: { id: string; companyName: string } | null;
};

function formatTimerDisplay(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function MobileActiveTimerBar() {
  const isMobile = useIsMobile();
  const {
    timer,
    isRunning,
    isPaused,
    isStopping,
    pauseMutation,
    resumeMutation,
  } = useActiveTimer();

  const [displaySeconds, setDisplaySeconds] = useState(0);

  useEffect(() => {
    if (!timer) {
      setDisplaySeconds(0);
      return;
    }
    const calculateElapsed = () => {
      let elapsed = timer.elapsedSeconds;
      if (timer.status === "running" && timer.lastStartedAt) {
        const lastStarted = new Date(timer.lastStartedAt).getTime();
        elapsed += Math.floor((Date.now() - lastStarted) / 1000);
      }
      return elapsed;
    };
    setDisplaySeconds(calculateElapsed());
    if (timer.status === "running") {
      const interval = setInterval(() => {
        setDisplaySeconds(calculateElapsed());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  if (!isMobile || !timer) return null;

  const label = timer.task?.title || timer.project?.name || timer.client?.companyName || "Timer";

  return (
    <div
      className="fixed bottom-16 left-0 right-0 z-40 bg-background border-t border-primary/30 px-3 py-2 flex items-center gap-2"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      data-testid="mobile-active-timer-bar"
    >
      <Clock className={`h-4 w-4 shrink-0 ${isRunning ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
      <span className="text-sm font-bold tabular-nums text-foreground" data-testid="mobile-timer-display">
        {formatTimerDisplay(displaySeconds)}
      </span>
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
        {label}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {isRunning ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => pauseMutation.mutate()}
            disabled={pauseMutation.isPending}
            data-testid="button-mobile-timer-pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        ) : isPaused ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => resumeMutation.mutate()}
            disabled={resumeMutation.isPending}
            data-testid="button-mobile-timer-resume"
          >
            <Play className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive"
          disabled={isStopping}
          data-testid="button-mobile-timer-stop"
          onClick={() => {
            window.location.href = "/my-time";
          }}
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
