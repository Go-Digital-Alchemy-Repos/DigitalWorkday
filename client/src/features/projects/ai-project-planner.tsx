import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Plus, X, ChevronRight, ChevronDown, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

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
  projectId: string;
}

type ApplyStatus = "idle" | "applying" | "done" | "partial-fail";

interface ApplyProgress {
  stage: "sections" | "tasks";
  current: number;
  total: number;
  failedTasks: string[];
}

async function createSection(projectId: string, name: string, orderIndex: number) {
  const res = await apiRequest("POST", "/api/sections", { projectId, name, orderIndex });
  return res.json();
}

async function createTask(data: { title: string; projectId: string; sectionId: string; priority: string; orderIndex: number }) {
  const res = await apiRequest("POST", "/api/tasks", data);
  return res.json();
}

async function fetchExistingSections(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/sections`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch sections");
  return res.json() as Promise<Array<{ id: string; name: string; orderIndex: number }>>;
}

export function AIProjectPlanner({
  projectName,
  projectDescription,
  clientName,
  projectId,
}: AIProjectPlannerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<ProjectPlanningSuggestion | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());
  const [createdTasks, setCreatedTasks] = useState<Set<string>>(new Set())/* keyed as "phaseIndex:taskIndex" */;
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>("idle");
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);
  const [sectionMap, setSectionMap] = useState<Map<string, string>>(new Map());

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
      setApplyStatus("idle");
      setCreatedTasks(new Set());
      setSectionMap(new Map());
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

  const taskKey = (phaseIndex: number, taskIndex: number) => `${phaseIndex}:${taskIndex}`;

  const findSectionByName = (sections: Array<{ id: string; name: string }>, name: string) =>
    sections.find(s => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  const invalidateCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  }, [queryClient, projectId]);

  const ensureSectionExists = useCallback(async (phaseName: string): Promise<string> => {
    if (sectionMap.has(phaseName)) {
      return sectionMap.get(phaseName)!;
    }

    const existing = await fetchExistingSections(projectId);
    const match = findSectionByName(existing, phaseName);
    if (match) {
      setSectionMap(prev => new Map(prev).set(phaseName, match.id));
      return match.id;
    }

    const section = await createSection(projectId, phaseName, existing.length);
    setSectionMap(prev => new Map(prev).set(phaseName, section.id));
    return section.id;
  }, [projectId, sectionMap]);

  const handleAddAllPlan = useCallback(async () => {
    if (!plan || applyStatus === "applying") return;

    setApplyStatus("applying");
    const failedTasks: string[] = [];
    const totalTasks = plan.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    let tasksCreated = 0;

    try {
      setApplyProgress({ stage: "sections", current: 0, total: plan.phases.length, failedTasks: [] });

      const phaseSectionIds: string[] = [];
      const existingSections = await fetchExistingSections(projectId);
      let nextOrder = existingSections.length;

      for (let i = 0; i < plan.phases.length; i++) {
        const phase = plan.phases[i];
        setApplyProgress({ stage: "sections", current: i + 1, total: plan.phases.length, failedTasks: [] });

        const match = findSectionByName(existingSections, phase.name);
        if (match) {
          phaseSectionIds.push(match.id);
          setSectionMap(prev => new Map(prev).set(phase.name, match.id));
        } else {
          const section = await createSection(projectId, phase.name, nextOrder);
          nextOrder++;
          phaseSectionIds.push(section.id);
          setSectionMap(prev => new Map(prev).set(phase.name, section.id));
        }
      }

      setApplyProgress({ stage: "tasks", current: 0, total: totalTasks, failedTasks: [] });

      for (let i = 0; i < plan.phases.length; i++) {
        const phase = plan.phases[i];
        const sectionId = phaseSectionIds[i];

        for (let j = 0; j < phase.tasks.length; j++) {
          const key = taskKey(i, j);
          if (createdTasks.has(key)) {
            tasksCreated++;
            setApplyProgress({ stage: "tasks", current: tasksCreated, total: totalTasks, failedTasks });
            continue;
          }

          const task = phase.tasks[j];
          try {
            await createTask({
              title: task.title,
              projectId,
              sectionId,
              priority: task.priority,
              orderIndex: j,
            });
            setCreatedTasks(prev => new Set(Array.from(prev).concat(key)));
          } catch {
            failedTasks.push(task.title);
          }
          tasksCreated++;
          setApplyProgress({ stage: "tasks", current: tasksCreated, total: totalTasks, failedTasks });
        }
      }

      invalidateCaches();

      if (failedTasks.length > 0) {
        setApplyStatus("partial-fail");
        toast({
          title: "Plan partially added",
          description: `${totalTasks - failedTasks.length}/${totalTasks} tasks created. ${failedTasks.length} failed.`,
          variant: "destructive",
        });
      } else {
        setApplyStatus("done");
        toast({ title: "Plan added to project", description: `${plan.phases.length} sections and ${totalTasks} tasks created.` });
      }
    } catch (error: any) {
      setApplyStatus("idle");
      invalidateCaches();
      toast({
        title: "Failed to apply plan",
        description: error.message || "Section creation failed",
        variant: "destructive",
      });
    }
  }, [plan, applyStatus, projectId, createdTasks, invalidateCaches, toast]);

  const handleCreateSingleTask = useCallback(async (phaseName: string, phaseIndex: number, task: { title: string; priority: string }, taskIdx: number) => {
    const key = taskKey(phaseIndex, taskIdx);
    if (createdTasks.has(key)) return;

    try {
      const sectionId = await ensureSectionExists(phaseName);
      await createTask({
        title: task.title,
        projectId,
        sectionId,
        priority: task.priority,
        orderIndex: taskIdx,
      });
      setCreatedTasks(prev => new Set(Array.from(prev).concat(key)));
      invalidateCaches();
    } catch (error: any) {
      toast({
        title: "Failed to add task",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [projectId, createdTasks, ensureSectionExists, invalidateCaches, toast]);

  const handleCreatePhaseAllTasks = useCallback(async (phase: Phase, phaseIndex: number) => {
    try {
      const sectionId = await ensureSectionExists(phase.name);

      for (let j = 0; j < phase.tasks.length; j++) {
        const key = taskKey(phaseIndex, j);
        if (createdTasks.has(key)) continue;

        const task = phase.tasks[j];
        try {
          await createTask({
            title: task.title,
            projectId,
            sectionId,
            priority: task.priority,
            orderIndex: j,
          });
          setCreatedTasks(prev => new Set(Array.from(prev).concat(key)));
        } catch {
          toast({ title: "Failed to add task", description: task.title, variant: "destructive" });
        }
      }

      invalidateCaches();
    } catch (error: any) {
      toast({ title: "Failed to create section", description: error.message, variant: "destructive" });
    }
  }, [projectId, createdTasks, ensureSectionExists, invalidateCaches, toast]);

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

  const allTasksCreated = plan?.phases.every((p, pi) => p.tasks.every((_, ti) => createdTasks.has(taskKey(pi, ti)))) ?? false;
  const isApplying = applyStatus === "applying";

  if (!aiStatus?.enabled) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
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
            <div className="flex items-center gap-2">
              {applyStatus === "done" ? (
                <Badge variant="outline" className="gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  Added
                </Badge>
              ) : applyStatus === "partial-fail" ? (
                <Badge variant="outline" className="gap-1 text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="h-3 w-3" />
                  Partial
                </Badge>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlan(null);
                  setCreatedTasks(new Set());
                  setApplyStatus("idle");
                  setApplyProgress(null);
                  setSectionMap(new Map());
                }}
                data-testid="button-clear-plan"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          )}
        </div>
        <CardDescription>
          {plan 
            ? "Review and add suggested sections and tasks to your project"
            : "Let AI suggest a project plan with phases and tasks"
          }
        </CardDescription>
      </CardHeader>

      {plan && (
        <CardContent className="space-y-4">
          {applyStatus !== "done" && !allTasksCreated && (
            <div className="flex items-center justify-between gap-2 p-3 bg-muted/50 rounded-md">
              <span className="text-sm font-medium">
                {isApplying && applyProgress ? (
                  applyProgress.stage === "sections"
                    ? `Creating sections (${applyProgress.current}/${applyProgress.total})...`
                    : `Adding tasks (${applyProgress.current}/${applyProgress.total})...`
                ) : (
                  `${plan.phases.length} sections, ${plan.phases.reduce((s, p) => s + p.tasks.length, 0)} tasks`
                )}
              </span>
              <Button
                onClick={handleAddAllPlan}
                disabled={isApplying || allTasksCreated}
                size="sm"
                data-testid="button-add-all-plan"
              >
                {isApplying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Add All to Project
              </Button>
            </div>
          )}

          {plan.phases.map((phase, phaseIndex) => {
            const allPhaseTasksCreated = phase.tasks.every((_, ti) => createdTasks.has(taskKey(phaseIndex, ti)));
            return (
              <div
                key={phaseIndex}
                className="border rounded-md overflow-hidden"
                data-testid={`phase-${phaseIndex}`}
              >
                <button
                  onClick={() => togglePhase(phaseIndex)}
                  className="w-full flex items-center justify-between p-3 bg-muted/50 hover-elevate text-left gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {expandedPhases.has(phaseIndex) ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <span className="font-medium truncate">{phase.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {phase.suggestedDuration}
                    </Badge>
                    {allPhaseTasksCreated && (
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {phase.tasks.length} tasks
                  </span>
                </button>

                {expandedPhases.has(phaseIndex) && (
                  <div className="p-3 space-y-2">
                    <p className="text-sm text-muted-foreground mb-3">
                      {phase.description}
                    </p>
                    {!allPhaseTasksCreated && (
                      <div className="flex justify-end mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreatePhaseAllTasks(phase, phaseIndex)}
                          className="text-xs"
                          disabled={isApplying}
                          data-testid={`button-add-all-phase-${phaseIndex}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add All Tasks
                        </Button>
                      </div>
                    )}
                    {phase.tasks.map((task, taskIndex) => (
                      <div
                        key={taskIndex}
                        className={cn(
                          "flex items-center justify-between gap-2 p-2 rounded-md border",
                          createdTasks.has(taskKey(phaseIndex, taskIndex)) && "opacity-50"
                        )}
                        data-testid={`task-${phaseIndex}-${taskIndex}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Badge className={cn("text-xs shrink-0", getPriorityColor(task.priority))}>
                            {task.priority}
                          </Badge>
                          <span className="text-sm truncate">{task.title}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCreateSingleTask(phase.name, phaseIndex, task, taskIndex)}
                          disabled={createdTasks.has(taskKey(phaseIndex, taskIndex)) || isApplying}
                          className="h-7 text-xs shrink-0"
                          data-testid={`button-add-task-${phaseIndex}-${taskIndex}`}
                        >
                          {createdTasks.has(taskKey(phaseIndex, taskIndex)) ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Added
                            </>
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
            );
          })}

          {plan.recommendations && plan.recommendations.length > 0 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-md">
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
