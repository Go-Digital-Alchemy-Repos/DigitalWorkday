import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ArrowLeft, Loader2, ShieldAlert, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface SlaPolicy {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  category: string | null;
  priority: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  escalationJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const priorityLabels: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const categoryLabels: Record<string, string> = {
  support: "Support",
  work_order: "Work Order",
  billing: "Billing",
  bug: "Bug Report",
  feature_request: "Feature Request",
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function SlaPolicyForm({ policy, onClose, onSaved }: { policy?: SlaPolicy; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [priority, setPriority] = useState(policy?.priority || "normal");
  const [category, setCategory] = useState(policy?.category || "__none__");
  const [firstResponseMinutes, setFirstResponseMinutes] = useState(policy?.firstResponseMinutes?.toString() || "60");
  const [resolutionMinutes, setResolutionMinutes] = useState(policy?.resolutionMinutes?.toString() || "480");

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        priority,
        category: category === "__none__" ? null : category,
        firstResponseMinutes: parseInt(firstResponseMinutes),
        resolutionMinutes: parseInt(resolutionMinutes),
      };
      if (policy) {
        return apiRequest("PUT", `/api/v1/support/sla-policies/${policy.id}`, body);
      }
      return apiRequest("POST", "/api/v1/support/sla-policies", body);
    },
    onSuccess: () => {
      toast({ title: policy ? "Policy updated" : "Policy created" });
      onSaved();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={setPriority} data-testid="select-sla-priority">
          <SelectTrigger data-testid="trigger-sla-priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(priorityLabels).map(([key, label]) => (
              <SelectItem key={key} value={key} data-testid={`option-priority-${key}`}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Category (optional - leave blank for all categories)</Label>
        <Select value={category} onValueChange={setCategory} data-testid="select-sla-category">
          <SelectTrigger data-testid="trigger-sla-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All Categories</SelectItem>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <SelectItem key={key} value={key} data-testid={`option-category-${key}`}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>First Response (minutes)</Label>
          <Input
            type="number"
            value={firstResponseMinutes}
            onChange={(e) => setFirstResponseMinutes(e.target.value)}
            min="1"
            data-testid="input-first-response-minutes"
          />
          <p className="text-xs text-muted-foreground">
            {parseInt(firstResponseMinutes) > 0 ? formatDuration(parseInt(firstResponseMinutes)) : "---"}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Resolution (minutes)</Label>
          <Input
            type="number"
            value={resolutionMinutes}
            onChange={(e) => setResolutionMinutes(e.target.value)}
            min="1"
            data-testid="input-resolution-minutes"
          />
          <p className="text-xs text-muted-foreground">
            {parseInt(resolutionMinutes) > 0 ? formatDuration(parseInt(resolutionMinutes)) : "---"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-sla">Cancel</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !priority || parseInt(firstResponseMinutes) <= 0 || parseInt(resolutionMinutes) <= 0}
          data-testid="button-save-sla"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {policy ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}

export default function SupportSlaPolicies() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPolicy, setEditingPolicy] = useState<SlaPolicy | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SlaPolicy | null>(null);

  const { data: policies, isLoading } = useQuery<SlaPolicy[]>({
    queryKey: ["/api/v1/support/sla-policies"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/support/sla-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/sla-policies"] });
      toast({ title: "Policy deleted" });
      setDeleteConfirm(null);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/support/sla-policies"] });
    setShowForm(false);
    setEditingPolicy(undefined);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/support")} data-testid="button-back-support">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">SLA Policies</h1>
          <p className="text-sm text-muted-foreground">Define response and resolution time targets by priority and category</p>
        </div>
        <Button onClick={() => { setEditingPolicy(undefined); setShowForm(true); }} data-testid="button-add-sla-policy">
          <Plus className="h-4 w-4 mr-2" />
          Add Policy
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !policies?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty-state">No SLA policies defined yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create policies to set response and resolution time targets for tickets</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => (
            <Card key={policy.id} className="hover-elevate" data-testid={`card-sla-policy-${policy.id}`}>
              <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" data-testid={`badge-priority-${policy.id}`}>
                      {priorityLabels[policy.priority] || policy.priority}
                    </Badge>
                    {policy.category && (
                      <Badge variant="secondary" data-testid={`badge-category-${policy.id}`}>
                        {categoryLabels[policy.category] || policy.category}
                      </Badge>
                    )}
                    {!policy.category && (
                      <span className="text-xs text-muted-foreground">All categories</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span data-testid={`text-first-response-${policy.id}`}>First Response: {formatDuration(policy.firstResponseMinutes)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span data-testid={`text-resolution-${policy.id}`}>Resolution: {formatDuration(policy.resolutionMinutes)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setEditingPolicy(policy); setShowForm(true); }}
                    data-testid={`button-edit-sla-${policy.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm(policy)}
                    data-testid={`button-delete-sla-${policy.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingPolicy(undefined); } }}>
        <DialogContent data-testid="dialog-sla-form">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? "Edit SLA Policy" : "New SLA Policy"}</DialogTitle>
            <DialogDescription>
              {editingPolicy ? "Update SLA targets for this policy" : "Define time targets for ticket response and resolution"}
            </DialogDescription>
          </DialogHeader>
          <SlaPolicyForm
            policy={editingPolicy}
            onClose={() => { setShowForm(false); setEditingPolicy(undefined); }}
            onSaved={handleSaved}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent data-testid="dialog-confirm-delete">
          <DialogHeader>
            <DialogTitle>Delete SLA Policy</DialogTitle>
            <DialogDescription>
              This will permanently remove this SLA policy. Existing tickets will keep their breach status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
