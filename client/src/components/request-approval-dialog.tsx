import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardCheck, Loader2 } from "lucide-react";

interface RequestApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  projectId?: string | null;
  taskId?: string | null;
  defaultTitle?: string;
}

interface ClientOption {
  id: string;
  companyName: string;
}

export function RequestApprovalDialog({
  open,
  onOpenChange,
  clientId,
  projectId,
  taskId,
  defaultTitle = "",
}: RequestApprovalDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: {
      clientId: string;
      projectId?: string | null;
      taskId?: string | null;
      title: string;
      instructions: string | null;
      dueAt: string | null;
    }) => {
      const res = await apiRequest("POST", `/api/crm/clients/${data.clientId}/approvals`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "approvals"] });
      toast({ title: "Approval request sent", description: "The client will be notified." });
      onOpenChange(false);
      setTitle("");
      setInstructions("");
      setDueAt("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a title for the approval request.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      clientId,
      projectId: projectId || null,
      taskId: taskId || null,
      title: title.trim(),
      instructions: instructions.trim() || null,
      dueAt: dueAt || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Request Approval
          </DialogTitle>
          <DialogDescription>
            Send an approval request to the client. They can approve or request changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="approval-title">Title</Label>
            <Input
              id="approval-title"
              placeholder="What needs approval?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-approval-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approval-instructions">Instructions (optional)</Label>
            <Textarea
              id="approval-instructions"
              placeholder="Provide details, context, or what to review..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              className="resize-none"
              data-testid="input-approval-instructions"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approval-due">Due Date (optional)</Label>
            <Input
              id="approval-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              data-testid="input-approval-due"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-approval">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !title.trim()}
            data-testid="button-submit-approval"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4 mr-1" />
            )}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestApprovalFromClientDialog({
  open,
  onOpenChange,
  projectId,
  taskId,
  defaultTitle = "",
}: Omit<RequestApprovalDialogProps, "clientId"> & { clientId?: string }) {
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState("");
  const [title, setTitle] = useState(defaultTitle);
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["/api/clients"],
    enabled: open,
    select: (data: any) => {
      if (Array.isArray(data)) return data;
      if (data?.clients) return data.clients;
      return [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      clientId: string;
      projectId?: string | null;
      taskId?: string | null;
      title: string;
      instructions: string | null;
      dueAt: string | null;
    }) => {
      const res = await apiRequest("POST", `/api/crm/clients/${data.clientId}/approvals`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      toast({ title: "Approval request sent", description: "The client will be notified." });
      onOpenChange(false);
      setTitle("");
      setInstructions("");
      setDueAt("");
      setSelectedClientId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedClientId) {
      toast({ title: "Client required", description: "Please select a client.", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a title.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      clientId: selectedClientId,
      projectId: projectId || null,
      taskId: taskId || null,
      title: title.trim(),
      instructions: instructions.trim() || null,
      dueAt: dueAt || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Request Client Approval
          </DialogTitle>
          <DialogDescription>
            Send an approval request to a client. They can approve or request changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger data-testid="select-approval-client">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="approval-title-2">Title</Label>
            <Input
              id="approval-title-2"
              placeholder="What needs approval?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-approval-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approval-instructions-2">Instructions (optional)</Label>
            <Textarea
              id="approval-instructions-2"
              placeholder="Provide details, context, or what to review..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              className="resize-none"
              data-testid="input-approval-instructions"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approval-due-2">Due Date (optional)</Label>
            <Input
              id="approval-due-2"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              data-testid="input-approval-due"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-approval">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !title.trim() || !selectedClientId}
            data-testid="button-submit-approval"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4 mr-1" />
            )}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
