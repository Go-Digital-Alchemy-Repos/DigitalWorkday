import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "./task-card";
import type { TaskWithRelations } from "@shared/schema";

interface SortableTaskCardProps {
  task: TaskWithRelations;
  view?: "list" | "board";
  onSelect?: () => void;
  onStatusChange?: (completed: boolean) => void;
  onPriorityChange?: (priority: "low" | "medium" | "high" | "urgent") => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  showQuickActions?: boolean;
  projectId?: string;
}

export function SortableTaskCard({
  task,
  view = "board",
  onSelect,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  showQuickActions = false,
  projectId,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "task", task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        view={view}
        onSelect={onSelect}
        onStatusChange={onStatusChange}
        onPriorityChange={onPriorityChange}
        onDueDateChange={onDueDateChange}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
        showQuickActions={showQuickActions}
        projectId={projectId}
      />
    </div>
  );
}
