import { forwardRef, useState, useRef, useEffect } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { 
  GripVertical, 
  User as UserIcon,
  CheckCircle2,
  Flag,
  CalendarDays,
} from "lucide-react";
import type { TaskWithRelations, User, Tag } from "@shared/schema";
import { getPreviewText } from "@/components/richtext/richTextUtils";
import { usePrefetchTask } from "@/hooks/use-prefetch";

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
}

export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  { task, view = "list", onSelect, onStatusChange, onPriorityChange, onDueDateChange, dragHandleProps, isDragging, showQuickActions = false },
  ref
) {
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);
  const isCompleted = task.status === "done";
  const { prefetch: prefetchTask, cancel: cancelPrefetch } = usePrefetchTask();
  const [justCompleted, setJustCompleted] = useState(false);
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

  const handleStatusChange = (checked: boolean) => {
    if (checked && !isCompleted) {
      setJustCompleted(true);
      timeoutRef.current = setTimeout(() => setJustCompleted(false), 400);
    }
    onStatusChange?.(checked);
  };

  if (view === "board") {
    return (
      <div
        ref={ref}
        className={cn(
          "group relative w-full rounded-lg border border-card-border bg-card p-3 hover-elevate cursor-pointer transition-all duration-150",
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
              className="mt-0.5"
              data-testid={`checkbox-task-${task.id}`}
            />
            <span
              className={cn(
                "text-sm font-medium flex-1",
                isCompleted && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </span>
          </div>

          {task.isPersonal && (
            <div className="pl-6">
              <Badge variant="outline" className="text-xs gap-1 px-1.5 py-0">
                <UserIcon className="h-3 w-3" />
                Personal
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
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "group relative grid items-center gap-3 px-4 py-3 min-h-[52px] border-b border-border hover-elevate cursor-pointer transition-all duration-150",
        showQuickActions 
          ? (dragHandleProps ? "grid-cols-[auto_auto_1fr_auto_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto_auto_auto]")
          : (dragHandleProps ? "grid-cols-[auto_auto_1fr_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto_auto]"),
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

      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              isCompleted && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </span>
          {task.isPersonal && (
            <Badge variant="outline" className="text-xs shrink-0 gap-1 px-1.5 py-0">
              <UserIcon className="h-3 w-3" />
              Personal
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

      <div className="flex items-center">
        {assigneeUsers.length > 0 && <AvatarGroup users={assigneeUsers} max={3} size="sm" />}
      </div>

      <div className="flex items-center">
        {task.dueDate && <DueDateBadge date={task.dueDate} size="sm" />}
      </div>

      <div className="flex items-center">
        <PriorityBadge priority={task.priority as any} showLabel={false} size="sm" />
      </div>

      {showQuickActions && (
        <div 
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onStatusChange?.(!isCompleted)}
            title={isCompleted ? "Mark incomplete" : "Mark complete"}
            data-testid={`quick-complete-${task.id}`}
          >
            <CheckCircle2 className={cn("h-4 w-4", isCompleted && "text-green-500")} />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Set priority"
                data-testid={`quick-priority-${task.id}`}
              >
                <Flag className="h-4 w-4" />
              </Button>
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
              <Button
                variant="ghost"
                size="icon"
                title="Set due date"
                data-testid={`quick-duedate-${task.id}`}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
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
  );
});
