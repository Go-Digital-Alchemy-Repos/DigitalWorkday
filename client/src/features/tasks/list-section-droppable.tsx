import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, ChevronDown, ChevronRight, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SortableTaskCard } from "./sortable-task-card";
import { cn } from "@/lib/utils";
import type { SectionWithTasks, TaskWithRelations } from "@shared/schema";

interface ListSectionDroppableProps {
  section: SectionWithTasks;
  onAddTask?: () => void;
  onTaskSelect?: (task: TaskWithRelations) => void;
  onTaskStatusChange?: (taskId: string, completed: boolean) => void;
  onPriorityChange?: (taskId: string, priority: "low" | "medium" | "high" | "urgent") => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
}

export function ListSectionDroppable({
  section,
  onAddTask,
  onTaskSelect,
  onTaskStatusChange,
  onPriorityChange,
  onDueDateChange,
}: ListSectionDroppableProps) {
  const [isOpen, setIsOpen] = useState(true);
  const tasks = section.tasks || [];
  const taskIds = tasks.map((t) => t.id);

  const { setNodeRef, isOver } = useDroppable({
    id: section.id,
    data: { type: "section", section },
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <div className="flex items-center gap-1 border-b border-border" data-testid={`list-section-${section.id}`}>
        <CollapsibleTrigger
          className="flex items-center gap-2 flex-1 py-2 px-2 hover:bg-muted/50 rounded-md transition-colors"
          data-testid={`section-trigger-${section.id}`}
        >
          {isOpen
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          }
          <LayoutList className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-sm">{section.name}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
            {tasks.length}
          </span>
        </CollapsibleTrigger>
        {onAddTask && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onAddTask}
                aria-label="Add task"
                data-testid={`button-add-task-list-${section.id}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add task</TooltipContent>
          </Tooltip>
        )}
      </div>

      <CollapsibleContent>
        {tasks.length > 0 && (
          <div className="grid items-center gap-2 px-4 py-1.5 grid-cols-[16px_20px_1fr_120px_100px_100px_96px_80px_32px] bg-muted/30 border-b border-border">
            <div />
            <div />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Task</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assignee</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Client</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Due Date</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Priority</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</span>
          </div>
        )}
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={cn(
              "transition-colors",
              isOver && "ring-2 ring-primary/50 bg-primary/5"
            )}
          >
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                view="list"
                onSelect={() => onTaskSelect?.(task)}
                onStatusChange={(completed) => onTaskStatusChange?.(task.id, completed)}
                onPriorityChange={(priority) => onPriorityChange?.(task.id, priority)}
                onDueDateChange={(dueDate) => onDueDateChange?.(task.id, dueDate)}
                showQuickActions={true}
              />
            ))}
            {tasks.length === 0 && (
              <div className="flex items-center justify-center py-8 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddTask}
                  data-testid={`button-add-task-empty-${section.id}`}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add task
                </Button>
              </div>
            )}
          </div>
        </SortableContext>
      </CollapsibleContent>
    </Collapsible>
  );
}
