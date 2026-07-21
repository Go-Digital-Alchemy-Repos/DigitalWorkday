import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TaskDetailDrawer } from "@/features/tasks/task-detail-drawer";
import { TaskDrawerSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X } from "lucide-react";
import type { TaskWithRelations } from "@shared/schema";
import { getTaskDrawerRenderState } from "@/lib/task-drawer-state";

interface TaskDrawerContextType {
  openTask: (taskId: string) => void;
  closeTask: () => void;
}

const TaskDrawerContext = createContext<TaskDrawerContextType | null>(null);

export function useTaskDrawer() {
  const context = useContext(TaskDrawerContext);
  if (!context) {
    throw new Error("useTaskDrawer must be used within a TaskDrawerProvider");
  }
  return context;
}

export function useTaskDrawerOptional() {
  const context = useContext(TaskDrawerContext);
  return context;
}

interface TaskDrawerProviderProps {
  children: ReactNode;
}

export function TaskDrawerProvider({ children }: TaskDrawerProviderProps) {
  const [taskIdToOpen, setTaskIdToOpen] = useState<string | null>(null);

  const { data: task, isLoading, isError } = useQuery<TaskWithRelations>({
    queryKey: ["/api/tasks", taskIdToOpen],
    enabled: !!taskIdToOpen,
    staleTime: 30000,
  });

  const openTask = useCallback((taskId: string) => {
    setTaskIdToOpen(taskId);
  }, []);

  const closeTask = useCallback(() => {
    setTaskIdToOpen(null);
  }, []);
  const value = useMemo<TaskDrawerContextType>(() => ({
    openTask,
    closeTask,
  }), [openTask, closeTask]);

  const isOpen = !!taskIdToOpen;
  const renderState = getTaskDrawerRenderState({
    taskIdToOpen,
    task,
    isLoading,
    isError,
  });

  return (
    <TaskDrawerContext.Provider value={value}>
      {children}
      {renderState === "loading" && (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) closeTask(); }}>
          <SheetContent
            className="w-full sm:max-w-2xl flex flex-col h-full p-0 overflow-hidden"
            data-testid="task-detail-drawer-loading"
          >
            <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
              <SheetDescription className="sr-only">Loading task details</SheetDescription>
              <div className="flex items-center justify-between">
                <SheetTitle className="sr-only">Loading Task</SheetTitle>
                <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={closeTask}
                  aria-label="Close drawer"
                  data-testid="button-close-drawer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <TaskDrawerSkeleton />
            </div>
          </SheetContent>
        </Sheet>
      )}
      {renderState === "error" && (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) closeTask(); }}>
          <SheetContent
            className="w-full sm:max-w-2xl flex flex-col h-full p-0 overflow-hidden"
            data-testid="task-detail-drawer-error"
          >
            <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
              <SheetDescription className="sr-only">Error loading task</SheetDescription>
              <div className="flex items-center justify-between">
                <SheetTitle className="text-destructive">Error</SheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={closeTask}
                  aria-label="Close drawer"
                  data-testid="button-close-drawer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </SheetHeader>
            <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="text-muted-foreground mb-4">Failed to load task details</div>
              <Button variant="outline" onClick={closeTask}>
                Close
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
      {renderState === "ready" && task && (
        <TaskDetailDrawer
          task={task}
          open={isOpen}
          onOpenChange={(open) => {
            if (!open) closeTask();
          }}
          workspaceId={task?.project?.workspaceId || ""}
        />
      )}
    </TaskDrawerContext.Provider>
  );
}
