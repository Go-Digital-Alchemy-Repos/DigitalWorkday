import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskStats {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  blocked: number;
}

interface TaskProgressBarProps {
  stats: TaskStats;
  className?: string;
}

export function TaskProgressBar({ stats, className }: TaskProgressBarProps) {
  const { total, done, inProgress, todo, blocked } = stats;
  const completionPercentage = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={cn("space-y-3", className)} data-testid="task-progress-bar">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-2xl font-bold text-primary">{completionPercentage}%</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {done} of {total} tasks completed
        </span>
      </div>

      <Progress value={completionPercentage} className="h-3" />

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5" data-testid="stat-done">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{done}</span> Done
          </span>
        </div>
        <div className="flex items-center gap-1.5" data-testid="stat-in-progress">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{inProgress}</span> In Progress
          </span>
        </div>
        <div className="flex items-center gap-1.5" data-testid="stat-todo">
          <Circle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{todo}</span> To Do
          </span>
        </div>
        {blocked > 0 && (
          <div className="flex items-center gap-1.5" data-testid="stat-blocked">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{blocked}</span> Blocked
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
