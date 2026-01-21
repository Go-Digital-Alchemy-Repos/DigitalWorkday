import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskSelectorWithCreate } from "@/components/task-selector-with-create";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StartTimerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartTimerDrawer({ open, onOpenChange }: StartTimerDrawerProps) {
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
    enabled: open,
  });

  const { data: allProjects = [] } = useQuery<Array<{ id: string; name: string; clientId: string | null }>>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const projects = clientId 
    ? allProjects.filter(p => p.clientId === clientId)
    : allProjects;

  const startMutation = useMutation({
    mutationFn: (data: { clientId?: string | null; projectId?: string | null; taskId?: string | null; description?: string }) =>
      apiRequest("POST", "/api/timer/start", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer started" });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start timer", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setDescription("");
    setClientId(null);
    setProjectId(null);
    setTaskId(null);
    setHasChanges(false);
  };

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  const handleFieldChange = () => {
    setHasChanges(true);
  };

  const handleClientChange = (value: string | null) => {
    setClientId(value);
    setProjectId(null);
    setTaskId(null);
    handleFieldChange();
  };

  const handleProjectChange = (value: string | null) => {
    setProjectId(value);
    setTaskId(null);
    handleFieldChange();
  };

  const handleStartTimer = () => {
    startMutation.mutate({
      clientId,
      projectId,
      taskId,
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
          <Select value={clientId || ""} onValueChange={(v) => handleClientChange(v || null)}>
            <SelectTrigger data-testid="select-start-timer-client">
              <SelectValue placeholder="Select client (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No client</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.displayName || client.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Project</Label>
          <Select 
            value={projectId || ""} 
            onValueChange={(v) => handleProjectChange(v || null)}
          >
            <SelectTrigger data-testid="select-start-timer-project">
              <SelectValue placeholder="Select project (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Task</Label>
          <TaskSelectorWithCreate
            taskId={taskId}
            onTaskChange={(id: string | null) => {
              setTaskId(id);
              handleFieldChange();
            }}
            projectId={projectId}
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              handleFieldChange();
            }}
            placeholder="What are you working on?"
            className="min-h-[100px] resize-none"
            data-testid="input-start-timer-description"
          />
        </div>
      </div>
    </FullScreenDrawer>
  );
}
