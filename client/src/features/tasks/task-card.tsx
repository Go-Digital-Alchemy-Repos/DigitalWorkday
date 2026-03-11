import { forwardRef, memo, useState, useRef, useEffect, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/priority-badge";
import { DueDateBadge } from "@/components/due-date-badge";
import { TagBadge } from "@/components/tag-badge";
import { AvatarGroup } from "@/components/avatar-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { 
  GripVertical, 
  User as UserIcon,
  CheckCircle2,
  Flag,
  CalendarDays,
  Link2,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import type { TaskWithRelations, User, Tag } from "@shared/schema";
import { getPreviewText } from "@/components/richtext/richTextUtils";
import { usePrefetchTask } from "@/hooks/use-prefetch";
import { useIsMobile } from "@/hooks/use-mobile";
import { LogTimeOnCompleteDialog } from "@/components/log-time-on-complete-dialog";

interface TaskCardProps {
  task: TaskWithRelations;
  view?: "list" | "board";
  onSelect?: () => void;
  onStatusChange?: (completed: boolean) => void;
  onPriorityChange?: (priority: "low" | "medium" | "high" | "urgent") => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  showQuickActions?: boolean;
  projectId?: string;
}

function useTaskLink(task: TaskWithRelations, projectId?: string) {
  const { toast } = useToast();
  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const pid = projectId || task.projectId;
    if (!pid) return;
    const url = `${window.location.origin}/projects/${pid}?task=${task.id}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied", description: "Task link copied to clipboard" });
    });
  };
  return { copyLink, hasProject: !!(projectId || task.projectId) };
}

export const TaskCard = memo(forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  { task, view = "list", onSelect, onStatusChange, onPriorityChange, onDueDateChange, dragHandleProps, isDragging, showQuickActions = false, projectId },
  ref
) {
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);
  const isCompleted = task.status === "done";
  const { prefetch: prefetchTask, cancel: cancelPrefetch } = usePrefetchTask();
  const isMobile = useIsMobile();
  const { enableTaskReviewQueue } = useFeatureFlags();
  const { copyLink, hasProject } = useTaskLink(task, projectId);
  const [justCompleted, setJustCompleted] = useState(false);
  const [showTimeDialog, setShowTimeDialog] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const assigneeUsers: Partial<User>[] = task.assignees?.map((a) => a.user).filter(Boolean) as Partial<User>[] || [];
  const taskTags: Tag[] = task.tags?.map((tt) => tt.tag).filter(Boolean) as Tag[] || [];
  const subtaskCount = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      cancelPrefetch();
    };
  }, [cancelPrefetch]);

  const triggerComplete = useCallback(() => {
    setJustCompleted(true);
    timeoutRef.current = setTimeout(() => setJustCompleted(false), 400);
    onStatusChange?.(true);
  }, [onStatusChange]);

  const handleStatusChange = (checked: boolean) => {
    if (checked && !isCompleted) {
      setShowTimeDialog(true);
    } else {
      onStatusChange?.(checked);
    }
  };

  const timeDialog = (
    <LogTimeOnCompleteDialog
      open={showTimeDialog}
      onOpenChange={setShowTimeDialog}
      itemType="task"
      itemId={task.id}
      itemTitle={task.title}
      taskId={task.id}
      projectId={task.projectId ?? null}
      clientId={task.project?.clientId ?? null}
      workspaceId={task.project?.workspaceId ?? ""}
      onComplete={async () => { triggerComplete(); }}
      onSkip={async () => { triggerComplete(); }}
    />
  );

  if (view === "board") {
    return (
      <>
      <div
        ref={ref}
        className={cn(
          "group relative w-full rounded-lg border border-card-border bg-card p-3 hover-elevate cursor-pointer transition-premium active:scale-[0.98] touch-manipulation",
          isCompleted && "opacity-60",
          isDragging && "opacity-50 shadow-lg",
          justCompleted && "task-complete-pulse"
        )}
        onClick={onSelect}
        onMouseEnter={() => prefetchTask(task.id)}
        onMouseLeave={cancelPrefetch}
        data-testid={`task-card-${task.id}`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            {dragHandleProps && (
              <div
                {...dragHandleProps}
                className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity touch-none min-h-8 min-w-6 flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div
              className="min-h-8 min-w-8 flex items-center justify-center -m-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isCompleted}
                onCheckedChange={(checked) => handleStatusChange(checked as boolean)}
                data-testid={`checkbox-task-${task.id}`}
              />
            </div>
            <span
              className={cn(
                "text-sm font-medium flex-1",
                isCompleted && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </span>
            {(task as any).visibility === "private" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" data-testid={`icon-private-${task.id}`} />
                </TooltipTrigger>
                <TooltipContent>Private task</TooltipContent>
              </Tooltip>
            )}
            {hasProject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={copyLink}
                    data-testid={`button-copy-link-${task.id}`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy task link</TooltipContent>
              </Tooltip>
            )}
          </div>

          {task.isPersonal && (
            <div className="pl-6">
              <Badge variant="outline" className="text-xs gap-1 px-1.5 py-0">
                <UserIcon className="h-3 w-3" />
                Personal
              </Badge>
            </div>
          )}

          {enableTaskReviewQueue && (task as any).needsPmReview && (
            <div className="pl-6">
              <Badge
                className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700"
                data-testid={`badge-review-${task.id}`}
              >
                Review
              </Badge>
            </div>
          )}
          {enableTaskReviewQueue && !(task as any).needsPmReview && (task as any).pmReviewResolvedAt && (
            <div className="pl-6">
              <Badge
                className="text-xs bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                data-testid={`badge-cleared-review-${task.id}`}
              >
                Cleared Review
              </Badge>
            </div>
          )}

          {task.description && getPreviewText(task.description, 150) && (
            <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
              {getPreviewText(task.description, 150)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pl-6">
            {taskTags.slice(0, 2).map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" />
            ))}
            {taskTags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{taskTags.length - 2}</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pl-6 pt-1">
            <div className="flex items-center gap-2">
              {task.dueDate && <DueDateBadge date={task.dueDate} size="sm" />}
              <PriorityBadge priority={task.priority as any} showLabel={false} size="sm" />
            </div>
            {assigneeUsers.length > 0 && (
              <AvatarGroup users={assigneeUsers} max={2} size="sm" />
            )}
          </div>

          {subtaskCount > 0 && (
            <div className="flex items-center gap-1 pl-6 text-xs text-muted-foreground">
              <span>{completedSubtasks}/{subtaskCount} subtasks</span>
            </div>
          )}
        </div>
      </div>
      {timeDialog}
      </>
    );
  }

  if (isMobile) {
    return (
      <>
      <div
        ref={ref}
        className={cn(
          "group relative flex items-start gap-3 px-3 py-3 min-h-[56px] border-b border-border hover-elevate cursor-pointer transition-premium active:bg-muted/50 touch-manipulation",
          isCompleted && "opacity-60",
          isDragging && "opacity-50 shadow-lg bg-card",
          justCompleted && "task-complete-pulse"
        )}
        onClick={onSelect}
        data-testid={`task-card-${task.id}`}
      >
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="cursor-grab touch-none mt-0.5 min-h-10 min-w-6 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div
          className="min-h-10 min-w-10 flex items-center justify-center mt-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isCompleted}
            onCheckedChange={(checked) => handleStatusChange(checked as boolean)}
            className="min-h-5 min-w-5"
            data-testid={`checkbox-task-${task.id}`}
          />
        </div>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "text-sm font-medium leading-snug",
                isCompleted && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {(task as any).visibility === "private" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" data-testid={`icon-private-${task.id}`} />
                  </TooltipTrigger>
                  <TooltipContent>Private task</TooltipContent>
                </Tooltip>
              )}
              {hasProject && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyLink}
                  title="Copy task link"
                  data-testid={`button-copy-link-${task.id}`}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {assigneeUsers.length > 0 && (
                <AvatarGroup users={assigneeUsers} max={2} size="sm" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={task.priority as any} showLabel={false} size="sm" />
            {task.dueDate && <DueDateBadge date={task.dueDate} size="sm" />}
            {task.isPersonal && (
              <Badge variant="outline" className="text-xs gap-1 px-1.5 py-0">
                <UserIcon className="h-3 w-3" />
                Personal
              </Badge>
            )}
            {enableTaskReviewQueue && (task as any).needsPmReview && (
              <Badge
                className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700"
                data-testid={`badge-review-${task.id}`}
              >
                Review
              </Badge>
            )}
            {enableTaskReviewQueue && !(task as any).needsPmReview && (task as any).pmReviewResolvedAt && (
              <Badge
                className="text-xs bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                data-testid={`badge-cleared-review-${task.id}`}
              >
                Cleared Review
              </Badge>
            )}
            {subtaskCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {completedSubtasks}/{subtaskCount}
              </span>
            )}
            {task.project?.name && (
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {task.project.name}
              </span>
            )}
          </div>
          {taskTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {taskTags.slice(0, 2).map((tag) => (
                <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" />
              ))}
              {taskTags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{taskTags.length - 2}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {timeDialog}
      </>
    );
  }

  const projectName = (task as any).projectName ?? (task as any).project?.name ?? null;
  const clientName = (task as any).clientName ?? (task as any).project?.client?.companyName ?? null;

  return (
    <>
    <div
      ref={ref}
      className={cn(
        "group relative grid items-center gap-2 px-4 py-2 min-h-[44px] border-b border-border hover-elevate cursor-pointer transition-premium",
        showQuickActions 
          ? (dragHandleProps ? "grid-cols-[16px_20px_1fr_160px_130px_130px_110px_100px_auto]" : "grid-cols-[20px_1fr_160px_130px_130px_110px_100px_auto]")
          : (dragHandleProps ? "grid-cols-[16px_20px_1fr_160px_130px_130px_110px_100px]" : "grid-cols-[20px_1fr_160px_130px_130px_110px_100px]"),
        isCompleted && "opacity-60",
        isDragging && "opacity-50 shadow-lg bg-card",
        justCompleted && "task-complete-pulse"
      )}
      onClick={onSelect}
      onMouseEnter={() => prefetchTask(task.id)}
      onMouseLeave={cancelPrefetch}
      data-testid={`task-card-${task.id}`}
    >
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <Checkbox
        checked={isCompleted}
        onCheckedChange={(checked) => handleStatusChange(checked as boolean)}
        onClick={(e) => e.stopPropagation()}
        data-testid={`checkbox-task-${task.id}`}
      />

      <div className="flex flex-col gap-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span
            className={cn(
              "text-sm font-medium truncate shrink",
              isCompleted && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </span>
          {(task as any).visibility === "private" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" data-testid={`icon-private-${task.id}`} />
              </TooltipTrigger>
              <TooltipContent>Private task</TooltipContent>
            </Tooltip>
          )}
          {hasProject && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={copyLink}
              title="Copy task link"
              data-testid={`button-copy-link-${task.id}`}
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {task.isPersonal && (
            <Badge variant="outline" className="text-xs shrink-0 gap-1 px-1.5 py-0">
              <UserIcon className="h-3 w-3" />
              Personal
            </Badge>
          )}
          {enableTaskReviewQueue && (task as any).needsPmReview && (
            <Badge
              className="text-xs shrink-0 bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700"
              data-testid={`badge-review-${task.id}`}
            >
              Review
            </Badge>
          )}
          {enableTaskReviewQueue && !(task as any).needsPmReview && (task as any).pmReviewResolvedAt && (
            <Badge
              className="text-xs shrink-0 bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
              data-testid={`badge-cleared-review-${task.id}`}
            >
              Cleared Review
            </Badge>
          )}
          {subtaskCount > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              ({completedSubtasks}/{subtaskCount})
            </span>
          )}
        </div>
        {taskTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {taskTags.slice(0, 3).map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" />
            ))}
            {taskTags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{taskTags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-hidden">
        {assigneeUsers.length > 0 ? (
          <>
            <AvatarGroup users={assigneeUsers.slice(0, 1)} max={1} size="sm" />
            <span className="text-xs text-muted-foreground truncate min-w-0">
              {assigneeUsers[0].name}
              {assigneeUsers.length > 1 && <span className="text-muted-foreground/70"> +{assigneeUsers.length - 1}</span>}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">Unassigned</span>
        )}
      </div>

      <div className="flex items-center overflow-hidden">
        {clientName ? (
          <span className="text-xs text-foreground truncate" title={clientName} data-testid={`badge-client-${task.id}`}>
            {clientName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      <div className="flex items-center overflow-hidden">
        {projectName ? (
          <span className="text-xs text-muted-foreground truncate" title={projectName} data-testid={`badge-project-${task.id}`}>
            {projectName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      <div className="flex items-center">
        {task.dueDate && <DueDateBadge date={task.dueDate} size="sm" />}
      </div>

      <div className="flex items-center">
        <PriorityBadge priority={task.priority as any} showLabel={true} size="sm" />
      </div>

      {showQuickActions && (
        <div 
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onStatusChange?.(!isCompleted)}
                data-testid={`quick-complete-${task.id}`}
              >
                <CheckCircle2 className={cn("h-4 w-4", isCompleted && "text-green-500")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isCompleted ? "Mark incomplete" : "Mark complete"}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    data-testid={`quick-priority-${task.id}`}
                  >
                    <Flag className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Set priority</TooltipContent>
              </Tooltip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPriorityChange?.("urgent")}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Urgent
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPriorityChange?.("high")}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                  High
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPriorityChange?.("medium")}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  Medium
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPriorityChange?.("low")}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Low
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    data-testid={`quick-duedate-${task.id}`}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Set due date</TooltipContent>
              </Tooltip>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={task.dueDate ? new Date(task.dueDate) : undefined}
                onSelect={(date) => {
                  onDueDateChange?.(date || null);
                  setDueDatePopoverOpen(false);
                }}
                initialFocus
              />
              {task.dueDate && (
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      onDueDateChange?.(null);
                      setDueDatePopoverOpen(false);
                    }}
                  >
                    Clear due date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
    {timeDialog}
    </>
  );
}));
