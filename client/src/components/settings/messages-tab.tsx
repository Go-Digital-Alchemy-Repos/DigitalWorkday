import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, FileText, GripVertical, Shield, UserCheck } from "lucide-react";
import type { MessagePermissions } from "@shared/schema";
import { DEFAULT_MESSAGE_PERMISSIONS } from "@shared/schema";

function AutoAssignCard() {
  const { toast } = useToast();

  const { data: settingsData, isLoading: settingsLoading } = useQuery<{
    defaultConversationAssigneeId: string | null;
    assignee: { id: string; name: string; role: string } | null;
  }>({
    queryKey: ["/api/crm/conversation-settings"],
  });

  const { data: tenantUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/tenant/users"],
  });

  const staffUsers = tenantUsers.filter((u: any) => u.role !== "client");

  const saveMutation = useMutation({
    mutationFn: async (assigneeId: string | null) => {
      const res = await apiRequest("PATCH", "/api/crm/conversation-settings", {
        defaultConversationAssigneeId: assigneeId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversation-settings"] });
      toast({ title: "Auto-assign setting updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Auto-Assign Rule
        </CardTitle>
        <CardDescription>
          Automatically assign new client conversations to a default team member. When set, all new conversations (including portal requests) will be assigned to this person.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settingsLoading ? (
          <Skeleton className="h-10 w-full max-w-xs" />
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={settingsData?.defaultConversationAssigneeId || "__none__"}
              onValueChange={(value) => {
                saveMutation.mutate(value === "__none__" ? null : value);
              }}
            >
              <SelectTrigger className="w-[250px]" data-testid="select-default-assignee">
                <SelectValue placeholder="No auto-assign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No auto-assign (manual)</SelectItem>
                {staffUsers.map((u: any) => (
                  <SelectItem key={u.id} value={u.id} data-testid={`option-assignee-${u.id}`}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  subject: string;
  bodyText: string;
  category: string;
  defaultMetadata: Record<string, unknown> | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "support", label: "Support" },
  { value: "feedback", label: "Feedback" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug_report", label: "Bug Report" },
  { value: "onboarding", label: "Onboarding" },
  { value: "other", label: "Other" },
];

const PERMISSION_LABELS: Record<keyof MessagePermissions, { label: string; description: string }> = {
  closeThread: { label: "Close / Reopen Threads", description: "Can close and reopen conversation threads" },
  changePriority: { label: "Change Priority", description: "Can change thread priority level" },
  viewInternalNotes: { label: "View Internal Notes", description: "Can see internal-only messages in threads" },
  assignThread: { label: "Assign Threads", description: "Can assign threads to team members" },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  employee: "Employee",
  client: "Client",
};

function PermissionsMatrixCard() {
  const { toast } = useToast();
  const { data: settingsData, isLoading } = useQuery<{ tenantSettings: { messagePermissions?: MessagePermissions } | null }>({
    queryKey: ["/api/v1/tenant/settings"],
  });

  const permissions: MessagePermissions = settingsData?.tenantSettings?.messagePermissions ?? DEFAULT_MESSAGE_PERMISSIONS;

  const saveMutation = useMutation({
    mutationFn: async (perms: MessagePermissions) => {
      const res = await apiRequest("PATCH", "/api/v1/tenant/settings", { messagePermissions: perms });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/message-permissions"] });
      toast({ title: "Permissions updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (action: keyof MessagePermissions, role: "admin" | "employee" | "client", checked: boolean) => {
    const updated: MessagePermissions = {
      ...permissions,
      [action]: {
        ...permissions[action],
        [role]: checked,
      },
    };
    saveMutation.mutate(updated);
  };

  const permissionKeys = Object.keys(PERMISSION_LABELS) as (keyof MessagePermissions)[];
  const roles = ["admin", "employee", "client"] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Message Permissions
        </CardTitle>
        <CardDescription>
          Control which roles can perform actions on conversation threads. Super admins always have full access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Action</th>
                  {roles.map((role) => (
                    <th key={role} className="text-center py-2 px-4 font-medium text-muted-foreground" data-testid={`th-role-${role}`}>
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissionKeys.map((action) => (
                  <tr key={action} className="border-b last:border-b-0">
                    <td className="py-3 pr-4">
                      <div>
                        <span className="font-medium" data-testid={`text-permission-label-${action}`}>{PERMISSION_LABELS[action].label}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{PERMISSION_LABELS[action].description}</p>
                      </div>
                    </td>
                    {roles.map((role) => (
                      <td key={role} className="text-center py-3 px-4">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={permissions[action]?.[role] ?? false}
                            onCheckedChange={(checked) => handleToggle(action, role, !!checked)}
                            disabled={saveMutation.isPending}
                            data-testid={`checkbox-perm-${action}-${role}`}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: MessageTemplate | null;
}) {
  const { toast } = useToast();
  const isEditing = !!template;

  const [name, setName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [bodyText, setBodyText] = useState(template?.bodyText || "");
  const [category, setCategory] = useState(template?.category || "general");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(template?.sortOrder ?? 0);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/crm/message-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/message-templates"] });
      toast({ title: "Template created" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/crm/message-templates/${template!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/message-templates"] });
      toast({ title: "Template updated" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !subject.trim()) {
      toast({ title: "Name and subject are required", variant: "destructive" });
      return;
    }

    const data = { name: name.trim(), subject: subject.trim(), bodyText: bodyText.trim(), category, isActive, sortOrder };

    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Template" : "Create Template"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the message template details." : "Create a new message template for portal users."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., General Inquiry"
              data-testid="input-template-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-template-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-subject">Pre-filled Subject</Label>
            <Input
              id="template-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., I need help with..."
              data-testid="input-template-subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-body">Pre-filled Message Body</Label>
            <Textarea
              id="template-body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Optional default message text..."
              className="min-h-[100px] resize-none"
              data-testid="input-template-body"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="template-sort">Sort Order</Label>
              <Input
                id="template-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                data-testid="input-template-sort"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="template-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                data-testid="switch-template-active"
              />
              <Label htmlFor="template-active">Active</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-template-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-template-save">
            {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MessagesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/crm/message-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/message-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/message-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/crm/message-templates/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/message-templates"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const handleEdit = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setDialogOpen(true);
  };

  const handleDelete = (template: MessageTemplate) => {
    if (confirm(`Delete template "${template.name}"?`)) {
      deleteMutation.mutate(template.id);
    }
  };

  const getCategoryLabel = (value: string) =>
    CATEGORIES.find((c) => c.value === value)?.label || value;

  return (
    <div className="space-y-6">
      <AutoAssignCard />

      <PermissionsMatrixCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Message Templates
            </CardTitle>
            <CardDescription>
              Configure templates that portal users can choose from when starting a new request.
              Templates pre-fill the subject line and message body.
            </CardDescription>
          </div>
          <Button onClick={handleCreate} data-testid="button-create-template">
            <Plus className="h-4 w-4 mr-1" />
            Add Template
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium mb-1">No templates yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create message templates so portal users can quickly start new requests.
              </p>
              <Button onClick={handleCreate} data-testid="button-create-template-empty">
                <Plus className="h-4 w-4 mr-1" />
                Create First Template
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border"
                  data-testid={`template-row-${template.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate" data-testid={`text-template-name-${template.id}`}>
                          {template.name}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {getCategoryLabel(template.category)}
                        </Badge>
                        {!template.isActive && (
                          <Badge variant="secondary" className="text-xs shrink-0">Inactive</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        Subject: {template.subject}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={template.isActive}
                      onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: template.id, isActive: checked })}
                      data-testid={`switch-active-${template.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(template)}
                      data-testid={`button-edit-template-${template.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template)}
                      data-testid={`button-delete-template-${template.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editingTemplate}
        key={editingTemplate?.id || "new"}
      />
    </div>
  );
}
