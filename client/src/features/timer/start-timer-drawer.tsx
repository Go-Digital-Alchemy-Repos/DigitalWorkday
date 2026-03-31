import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, tenantKey } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskSelectorWithCreate } from "@/features/tasks/task-selector-with-create";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/richtext";
import { useTimeEntryCascade } from "@/hooks/use-time-entry-cascade";

const BROADCAST_CHANNEL_NAME = "active-timer-sync";

interface StartTimerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-populate the client field */
  initialClientId?: string | null;
  /** Pre-populate the project field */
  initialProjectId?: string | null;
  /** Pre-populate the task field */
  initialTaskId?: string | null;
}

export function StartTimerDrawer({ 
  open, 
  onOpenChange,
  initialClientId = null,
  initialProjectId = null,
  initialTaskId = null,
}: StartTimerDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const handleFieldChange = () => {
    setHasChanges(true);
  };

  const {
    clientId, projectId, taskId, subtaskId,
    clients, clientProjects, subtasks, hasSubtasks, finalTaskId,
    handleClientChange: cascadeClientChange,
    handleProjectChange: cascadeProjectChange,
    handleTaskChange: cascadeTaskChange,
    handleSubtaskChange,
    resetAll,
  } = useTimeEntryCascade({
    enabled: open,
    onChange: handleFieldChange,
    initialValues: {
      clientId: initialClientId,
      projectId: initialProjectId,
      taskId: initialTaskId,
    },
  });

  const broadcastTimerUpdate = useCallback(() => {
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "timer-updated" });
      } catch {
      }
    }
    try {
      localStorage.setItem("timer-sync", Date.now().toString());
      localStorage.removeItem("timer-sync");
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
    }
    return () => {
      broadcastChannelRef.current?.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  const startMutation = useMutation({
    mutationFn: async (data: { clientId?: string | null; projectId?: string | null; taskId?: string | null; title?: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/timer/start", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && errorData.error === "TIMER_ALREADY_RUNNING") {
          throw new Error("TIMER_ALREADY_RUNNING");
        }
        throw new Error(errorData.message || errorData.error || "Failed to start timer");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantKey(queryKeys.timer.current) });
      broadcastTimerUpdate();
      toast({ title: "Timer started" });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      if (error.message === "TIMER_ALREADY_RUNNING") {
        toast({ 
          title: "Timer already running", 
          description: "You already have an active timer. Stop it before starting a new one.", 
          variant: "destructive" 
        });
        queryClient.invalidateQueries({ queryKey: tenantKey(queryKeys.timer.current) });
        onOpenChange(false);
      } else {
        toast({ title: "Failed to start timer", description: error.message, variant: "destructive" });
      }
    },
  });

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    resetAll({
      clientId: initialClientId,
      projectId: initialProjectId,
      taskId: initialTaskId,
      subtaskId: null,
    });
    setHasChanges(false);
  }, [initialClientId, initialProjectId, initialTaskId, resetAll]);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleStartTimer = () => {
    startMutation.mutate({
      clientId,
      projectId,
      taskId: finalTaskId,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Start Timer"
      hasUnsavedChanges={hasChanges}
      footer={
        <FullScreenDrawerFooter
          onCancel={() => onOpenChange(false)}
          onSave={handleStartTimer}
          isLoading={startMutation.isPending}
          saveLabel="Start Timer"
          cancelLabel="Cancel"
        />
      }
    >
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Label>Client</Label>
          <Select value={clientId || "none"} onValueChange={(v) => cascadeClientChange(v === "none" ? null : v)}>
            <SelectTrigger data-testid="select-start-timer-client">
              <SelectValue placeholder="Select client (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No client</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Project</Label>
          <Select 
            value={projectId || "none"} 
            onValueChange={(v) => cascadeProjectChange(v === "none" ? null : v)}
            disabled={!clientId}
          >
            <SelectTrigger data-testid="select-start-timer-project">
              <SelectValue placeholder={clientId ? "Select project (optional)" : "Select client first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {clientProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <TaskSelectorWithCreate
            taskId={taskId}
            onTaskChange={cascadeTaskChange}
            projectId={projectId}
          />
        </div>

        {hasSubtasks && (
          <div className="space-y-2">
            <Label>Subtask</Label>
            <Select 
              value={subtaskId || "none"} 
              onValueChange={(v) => handleSubtaskChange(v === "none" ? null : v)}
            >
              <SelectTrigger data-testid="select-start-timer-subtask">
                <SelectValue placeholder="Select subtask (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No subtask</SelectItem>
                {subtasks.map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              handleFieldChange();
            }}
            placeholder="Brief summary of work (e.g., Website updates)"
            data-testid="input-start-timer-title"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <div className="min-h-[150px] border rounded-md focus-within:ring-1 focus-within:ring-ring transition-shadow">
            <RichTextEditor
              value={description}
              onChange={(val) => {
                setDescription(val);
                handleFieldChange();
              }}
              placeholder="Additional details about the work..."
              className="border-0 focus-visible:ring-0"
            />
          </div>
        </div>
      </div>
    </FullScreenDrawer>
  );
}
