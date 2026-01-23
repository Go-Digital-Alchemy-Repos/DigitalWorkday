import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, Plus, X, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Phase {
  name: string;
  description: string;
  suggestedDuration: string;
  tasks: Array<{
    title: string;
    priority: "high" | "medium" | "low";
  }>;
}

interface ProjectPlanningSuggestion {
  phases: Phase[];
  recommendations?: string[];
}

interface AIProjectPlannerProps {
  projectName: string;
  projectDescription?: string;
  clientName?: string;
  onCreateTask: (title: string) => void;
}

export function AIProjectPlanner({
  projectName,
  projectDescription,
  clientName,
  onCreateTask,
}: AIProjectPlannerProps) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<ProjectPlanningSuggestion | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());
  const [createdTasks, setCreatedTasks] = useState<Set<string>>(new Set());

  const { data: aiStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/v1/ai/status"],
    queryFn: async () => {
      const res = await fetch("/api/v1/ai/status", { credentials: "include" });
      if (!res.ok) return { enabled: false };
      return res.json();
    },
    staleTime: 60000,
  });

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/ai/suggest/project-plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          projectDescription,
          clientName,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate project plan");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPlan(data);
      setExpandedPhases(new Set(data.phases.map((_: Phase, i: number) => i)));
      toast({ title: "Project plan generated" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to generate plan", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleCreateTask = (task: { title: string }) => {
    onCreateTask(task.title);
    setCreatedTasks((prev) => new Set(Array.from(prev).concat(task.title)));
  };

  const handleCreateAllTasks = (phase: Phase) => {
    phase.tasks.forEach((task) => {
      if (!createdTasks.has(task.title)) {
        onCreateTask(task.title);
        setCreatedTasks((prev) => new Set(Array.from(prev).concat(task.title)));
      }
    });
  };

  const togglePhase = (index: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "low":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      default:
        return "";
    }
  };

  if (!aiStatus?.enabled) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">AI Project Planner</CardTitle>
          </div>
          {!plan && (
            <Button
              onClick={() => generatePlanMutation.mutate()}
              disabled={generatePlanMutation.isPending}
              size="sm"
              data-testid="button-generate-project-plan"
            >
              {generatePlanMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate Plan
            </Button>
          )}
          {plan && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPlan(null);
                setCreatedTasks(new Set());
              }}
              data-testid="button-clear-plan"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <CardDescription>
          {plan 
            ? "Review and add suggested tasks to your project"
            : "Let AI suggest a project plan with phases and tasks"
          }
        </CardDescription>
      </CardHeader>

      {plan && (
        <CardContent className="space-y-4">
          {plan.phases.map((phase, phaseIndex) => (
            <div
              key={phaseIndex}
              className="border rounded-lg overflow-hidden"
              data-testid={`phase-${phaseIndex}`}
            >
              <button
                onClick={() => togglePhase(phaseIndex)}
                className="w-full flex items-center justify-between p-3 bg-muted/50 hover-elevate text-left"
              >
                <div className="flex items-center gap-2">
                  {expandedPhases.has(phaseIndex) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-medium">{phase.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {phase.suggestedDuration}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {phase.tasks.length} tasks
                </span>
              </button>

              {expandedPhases.has(phaseIndex) && (
                <div className="p-3 space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    {phase.description}
                  </p>
                  <div className="flex justify-end mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCreateAllTasks(phase)}
                      className="text-xs"
                      data-testid={`button-add-all-phase-${phaseIndex}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add All Tasks
                    </Button>
                  </div>
                  {phase.tasks.map((task, taskIndex) => (
                    <div
                      key={taskIndex}
                      className={cn(
                        "flex items-center justify-between gap-2 p-2 rounded-md border",
                        createdTasks.has(task.title) && "opacity-50"
                      )}
                      data-testid={`task-${phaseIndex}-${taskIndex}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge className={cn("text-xs", getPriorityColor(task.priority))}>
                          {task.priority}
                        </Badge>
                        <span className="text-sm truncate">{task.title}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCreateTask(task)}
                        disabled={createdTasks.has(task.title)}
                        className="h-7 text-xs"
                        data-testid={`button-add-task-${phaseIndex}-${taskIndex}`}
                      >
                        {createdTasks.has(task.title) ? (
                          "Added"
                        ) : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {plan.recommendations && plan.recommendations.length > 0 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Recommendations</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {plan.recommendations.map((rec, index) => (
                  <li key={index} className="flex gap-2">
                    <span>•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
