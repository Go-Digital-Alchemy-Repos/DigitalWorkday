import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Zap,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  History,
  Play,
} from "lucide-react";
import {
  CLIENT_STAGE_LABELS,
  CLIENT_STAGES_ORDERED,
  AUTOMATION_TRIGGER_LABELS,
  AutomationTriggerType,
  type ClientStageAutomationRule,
  type ClientStageAutomationEvent,
  type AutomationTriggerTypeValue,
  type ClientStageType,
} from "@shared/schema";

const TRIGGER_OPTIONS = Object.entries(AUTOMATION_TRIGGER_LABELS).map(([value, label]) => ({
  value: value as AutomationTriggerTypeValue,
  label,
}));

const STAGE_OPTIONS = CLIENT_STAGES_ORDERED.map((stage) => ({
  value: stage,
  label: CLIENT_STAGE_LABELS[stage],
}));

interface RuleFormState {
  name: string;
  triggerType: AutomationTriggerTypeValue;
  toStage: ClientStageType;
  allowBackward: boolean;
  allowSkipStages: boolean;
  triggerConfig: Record<string, any>;
  conditionConfig: Record<string, any>;
}

const defaultFormState: RuleFormState = {
  name: "",
  triggerType: AutomationTriggerType.PROJECT_CREATED,
  toStage: "proposal" as ClientStageType,
  allowBackward: false,
  allowSkipStages: true,
  triggerConfig: {},
  conditionConfig: {},
};

function TriggerConfigFields({
  triggerType,
  triggerConfig,
  onChange,
}: {
  triggerType: AutomationTriggerTypeValue;
  triggerConfig: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}) {
  switch (triggerType) {
    case "project_status_changed":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Target Status (to)</Label>
            <Input
              value={triggerConfig.to || ""}
              onChange={(e) => onChange({ ...triggerConfig, to: e.target.value })}
              placeholder="e.g. in_progress, completed"
              data-testid="input-trigger-to-status"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">From Status (optional)</Label>
            <Input
              value={triggerConfig.from || ""}
              onChange={(e) => onChange({ ...triggerConfig, from: e.target.value })}
              placeholder="e.g. active, planning"
              data-testid="input-trigger-from-status"
            />
          </div>
        </div>
      );

    case "task_completed":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Section Name (optional)</Label>
            <Input
              value={triggerConfig.sectionName || ""}
              onChange={(e) => onChange({ ...triggerConfig, sectionName: e.target.value })}
              placeholder="e.g. Design Review"
              data-testid="input-trigger-section-name"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Task Tag (optional)</Label>
            <Input
              value={triggerConfig.taskTag || ""}
              onChange={(e) => onChange({ ...triggerConfig, taskTag: e.target.value })}
              placeholder="e.g. milestone"
              data-testid="input-trigger-task-tag"
            />
          </div>
        </div>
      );

    case "all_tasks_in_section_completed":
      return (
        <div>
          <Label className="text-xs text-muted-foreground">Section Name (optional)</Label>
          <Input
            value={triggerConfig.sectionName || ""}
            onChange={(e) => onChange({ ...triggerConfig, sectionName: e.target.value })}
            placeholder="e.g. Development Tasks"
            data-testid="input-trigger-section-name-all"
          />
        </div>
      );

    default:
      return null;
  }
}

function ConditionConfigFields({
  conditionConfig,
  onChange,
}: {
  conditionConfig: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}) {
  const currentStageIn = (conditionConfig.currentStageIn || []) as string[];
  const toggleStage = (stage: string) => {
    const updated = currentStageIn.includes(stage)
      ? currentStageIn.filter((s: string) => s !== stage)
      : [...currentStageIn, stage];
    onChange({ ...conditionConfig, currentStageIn: updated.length > 0 ? updated : undefined });
  };

  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-2 block">
        Only apply when client is in these stages (leave empty for any)
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {STAGE_OPTIONS.map((opt) => (
          <Badge
            key={opt.value}
            variant={currentStageIn.includes(opt.value) ? "default" : "outline"}
            className="cursor-pointer select-none toggle-elevate"
            onClick={() => toggleStage(opt.value)}
            data-testid={`badge-condition-stage-${opt.value}`}
          >
            {opt.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  switch (outcome) {
    case "applied":
      return <Badge variant="default" className="bg-green-600 text-white"><CheckCircle2 className="w-3 h-3 mr-1" />Applied</Badge>;
    case "skipped":
      return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Skipped</Badge>;
    case "failed":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="outline">{outcome}</Badge>;
  }
}

export function PipelineAutomationTab() {
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ClientStageAutomationRule | null>(null);
  const [formState, setFormState] = useState<RuleFormState>(defaultFormState);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [showEventsLog, setShowEventsLog] = useState(false);

  const rulesQuery = useQuery<ClientStageAutomationRule[]>({
    queryKey: ["/api/v1/automation/client-stage-rules"],
  });

  const eventsQuery = useQuery<ClientStageAutomationEvent[]>({
    queryKey: ["/api/v1/automation/client-stage-events"],
    enabled: showEventsLog,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<RuleFormState>) => {
      const res = await apiRequest("POST", "/api/v1/automation/client-stage-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automation/client-stage-rules"] });
      toast({ title: "Rule created", description: "Automation rule has been created successfully." });
      closeSheet();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create rule", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RuleFormState> }) => {
      const res = await apiRequest("PATCH", `/api/v1/automation/client-stage-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automation/client-stage-rules"] });
      toast({ title: "Rule updated", description: "Automation rule has been updated." });
      closeSheet();
    },
    onError: (err: any) => {
      toast({ title: "Failed to update rule", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/v1/automation/client-stage-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automation/client-stage-rules"] });
      toast({ title: "Rule deleted", description: "Automation rule has been removed." });
      setDeleteRuleId(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete rule", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/v1/automation/client-stage-rules/${id}`, { isEnabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automation/client-stage-rules"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to toggle rule", description: err.message, variant: "destructive" });
    },
  });

  function openCreateSheet() {
    setEditingRule(null);
    setFormState(defaultFormState);
    setSheetOpen(true);
  }

  function openEditSheet(rule: ClientStageAutomationRule) {
    setEditingRule(rule);
    setFormState({
      name: rule.name,
      triggerType: rule.triggerType as AutomationTriggerTypeValue,
      toStage: rule.toStage as ClientStageType,
      allowBackward: rule.allowBackward,
      allowSkipStages: rule.allowSkipStages,
      triggerConfig: (rule.triggerConfig || {}) as Record<string, any>,
      conditionConfig: (rule.conditionConfig || {}) as Record<string, any>,
    });
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingRule(null);
    setFormState(defaultFormState);
  }

  function handleSubmit() {
    if (!formState.name.trim()) {
      toast({ title: "Name required", description: "Enter a name for the automation rule.", variant: "destructive" });
      return;
    }

    const payload = {
      name: formState.name,
      triggerType: formState.triggerType,
      toStage: formState.toStage,
      allowBackward: formState.allowBackward,
      allowSkipStages: formState.allowSkipStages,
      triggerConfig: formState.triggerConfig,
      conditionConfig: formState.conditionConfig,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const rules = rulesQuery.data || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Pipeline Automation Rules
            </CardTitle>
            <CardDescription>
              Automatically move clients through pipeline stages when projects or tasks reach milestones.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEventsLog(!showEventsLog)}
              data-testid="button-toggle-events-log"
            >
              <History className="h-4 w-4 mr-1" />
              {showEventsLog ? "Hide Log" : "Event Log"}
            </Button>
            <Button size="sm" onClick={openCreateSheet} data-testid="button-create-rule">
              <Plus className="h-4 w-4 mr-1" />
              New Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rulesQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No automation rules configured yet.</p>
              <p className="text-xs mt-1">Create your first rule to automatically move clients through the pipeline.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border"
                  data-testid={`automation-rule-${rule.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{rule.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {AUTOMATION_TRIGGER_LABELS[rule.triggerType as AutomationTriggerTypeValue] || rule.triggerType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      <span>Move to <strong>{CLIENT_STAGE_LABELS[rule.toStage as ClientStageType] || rule.toStage}</strong></span>
                      {!rule.allowBackward && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4">Forward only</Badge>
                      )}
                      {!rule.allowSkipStages && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4">No skip</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={rule.isEnabled}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, isEnabled: checked })}
                      data-testid={`switch-rule-enabled-${rule.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditSheet(rule)}
                      data-testid={`button-edit-rule-${rule.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteRuleId(rule.id)}
                      data-testid={`button-delete-rule-${rule.id}`}
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

      {showEventsLog && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Recent Automation Events
            </CardTitle>
            <CardDescription>Audit log of automation rule evaluations</CardDescription>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No automation events recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {eventsQuery.data.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-md border text-xs"
                    data-testid={`automation-event-${event.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{event.ruleName || "Unknown Rule"}</span>
                        <OutcomeBadge outcome={event.outcome} />
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        <span>{AUTOMATION_TRIGGER_LABELS[event.triggerType as AutomationTriggerTypeValue] || event.triggerType}</span>
                        {event.reason && <span className="ml-2">- {event.reason}</span>}
                      </div>
                    </div>
                    <div className="text-muted-foreground shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(event.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingRule ? "Edit Automation Rule" : "Create Automation Rule"}</SheetTitle>
            <SheetDescription>
              {editingRule
                ? "Update the automation rule settings."
                : "Set up a new rule to automatically advance clients through the pipeline."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 mt-6">
            <div>
              <Label htmlFor="rule-name">Rule Name</Label>
              <Input
                id="rule-name"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                placeholder="e.g. Move to Proposal on project creation"
                data-testid="input-rule-name"
              />
            </div>

            <div>
              <Label>Trigger Event</Label>
              <Select
                value={formState.triggerType}
                onValueChange={(v) =>
                  setFormState({
                    ...formState,
                    triggerType: v as AutomationTriggerTypeValue,
                    triggerConfig: {},
                  })
                }
              >
                <SelectTrigger data-testid="select-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TriggerConfigFields
              triggerType={formState.triggerType}
              triggerConfig={formState.triggerConfig}
              onChange={(config) => setFormState({ ...formState, triggerConfig: config })}
            />

            <div>
              <Label>Target Stage</Label>
              <Select
                value={formState.toStage}
                onValueChange={(v) => setFormState({ ...formState, toStage: v as ClientStageType })}
              >
                <SelectTrigger data-testid="select-target-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ConditionConfigFields
              conditionConfig={formState.conditionConfig}
              onChange={(config) => setFormState({ ...formState, conditionConfig: config })}
            />

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-medium">Stage Guards</Label>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Allow Backward Moves</p>
                  <p className="text-xs text-muted-foreground">Let this rule move clients to earlier stages</p>
                </div>
                <Switch
                  checked={formState.allowBackward}
                  onCheckedChange={(v) => setFormState({ ...formState, allowBackward: v })}
                  data-testid="switch-allow-backward"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Allow Skipping Stages</p>
                  <p className="text-xs text-muted-foreground">Let this rule jump over intermediate stages</p>
                </div>
                <Switch
                  checked={formState.allowSkipStages}
                  onCheckedChange={(v) => setFormState({ ...formState, allowSkipStages: v })}
                  data-testid="switch-allow-skip"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={isSubmitting}
                data-testid="button-submit-rule"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingRule ? "Save Changes" : "Create Rule"}
              </Button>
              <Button variant="outline" onClick={closeSheet} data-testid="button-cancel-rule">
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation Rule</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this automation rule. Past automation events will be preserved in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRuleId && deleteMutation.mutate(deleteRuleId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
