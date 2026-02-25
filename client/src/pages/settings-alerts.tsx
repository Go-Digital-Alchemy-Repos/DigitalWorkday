import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Bell, ShieldAlert, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const RULE_TYPES = [
  { value: "employee_overload", label: "Employee Overload" },
  { value: "employee_underutilized", label: "Employee Underutilized" },
  { value: "employee_low_compliance", label: "Employee Low Compliance" },
  { value: "project_deadline_high_risk", label: "Project Deadline High Risk" },
  { value: "client_health_critical", label: "Client Health Critical" },
  { value: "client_risk_worsening", label: "Client Risk Worsening" },
];

const SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const alertRuleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ruleType: z.string().min(1, "Rule type is required"),
  severity: z.string().min(1, "Severity is required"),
  description: z.string().optional(),
  throttleMinutes: z.coerce.number().min(1).default(60),
  deliveryChannels: z.array(z.string()).default([]),
  isEnabled: z.boolean().default(true),
});

type AlertRuleFormValues = z.infer<typeof alertRuleSchema>;

interface AlertRule {
  id: string;
  name: string;
  ruleType: string;
  severity: string;
  description: string | null;
  throttleMinutes: number;
  deliveryChannels: string[];
  isEnabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
}

interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName?: string;
  title: string;
  entityId: string | null;
  entityType: string | null;
  severity: string;
  triggeredAt: string;
  isAcknowledged: boolean;
}

function severityVariant(severity: string): "default" | "secondary" | "destructive" {
  if (severity === "critical" || severity === "high") return "destructive";
  if (severity === "medium") return "default";
  return "secondary";
}

function AlertRuleForm({
  defaultValues,
  onSubmit,
  isPending,
}: {
  defaultValues?: Partial<AlertRuleFormValues>;
  onSubmit: (values: AlertRuleFormValues) => void;
  isPending: boolean;
}) {
  const form = useForm<AlertRuleFormValues>({
    resolver: zodResolver(alertRuleSchema),
    defaultValues: {
      name: "",
      ruleType: "",
      severity: "medium",
      description: "",
      throttleMinutes: 60,
      deliveryChannels: ["in_app"],
      isEnabled: true,
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rule Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Team Overload Alert" {...field} data-testid="input-alert-rule-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ruleType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rule Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-alert-rule-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {RULE_TYPES.map((rt) => (
                    <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="severity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Severity</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-alert-severity">
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Short description of this rule" {...field} data-testid="input-alert-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="throttleMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Throttle (minutes)</FormLabel>
              <FormControl>
                <Input type="number" min={1} {...field} data-testid="input-alert-throttle" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="deliveryChannels"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Delivery Channels</FormLabel>
              <div className="flex flex-col gap-2">
                {(["in_app", "email"] as const).map((ch) => (
                  <div key={ch} className="flex items-center gap-2">
                    <Checkbox
                      id={`channel-${ch}`}
                      checked={field.value.includes(ch)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          field.onChange([...field.value, ch]);
                        } else {
                          field.onChange(field.value.filter((v) => v !== ch));
                        }
                      }}
                      data-testid={`checkbox-channel-${ch}`}
                    />
                    <label htmlFor={`channel-${ch}`} className="text-sm capitalize">
                      {ch === "in_app" ? "In-app" : "Email"}
                    </label>
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-alert-enabled"
                />
              </FormControl>
              <FormLabel className="!mt-0">Enabled</FormLabel>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending} data-testid="button-save-alert-rule">
          {isPending ? "Saving…" : "Save Rule"}
        </Button>
      </form>
    </Form>
  );
}

export default function AlertRulesPage() {
  const flags = useFeatureFlags();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ rules: AlertRule[] }>({
    queryKey: ["/api/reports/v2/alerts/rules"],
    enabled: flags.enableAlertAutomation,
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: AlertEvent[]; total: number }>({
    queryKey: ["/api/reports/v2/alerts/events"],
    queryFn: async () => {
      const res = await fetch("/api/reports/v2/alerts/events?limit=50");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: flags.enableAlertAutomation,
  });

  const createMutation = useMutation({
    mutationFn: (values: AlertRuleFormValues) =>
      apiRequest("POST", "/api/reports/v2/alerts/rules", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/v2/alerts/rules"] });
      toast({ title: "Alert rule created" });
      setSheetOpen(false);
    },
    onError: () => toast({ title: "Failed to create rule", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<AlertRuleFormValues> }) =>
      apiRequest("PATCH", `/api/reports/v2/alerts/rules/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/v2/alerts/rules"] });
      toast({ title: "Alert rule updated" });
      setSheetOpen(false);
      setEditingRule(null);
    },
    onError: () => toast({ title: "Failed to update rule", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/reports/v2/alerts/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/v2/alerts/rules"] });
      toast({ title: "Alert rule deleted" });
    },
    onError: () => toast({ title: "Failed to delete rule", variant: "destructive" }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/reports/v2/alerts/events/${id}/acknowledge`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/v2/alerts/events"] });
      toast({ title: "Event acknowledged" });
    },
    onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
  });

  if (!flags.enableAlertAutomation) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Bell className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Alert Automation is not enabled</p>
        <p className="text-xs">Enable the feature flag to use this feature.</p>
      </div>
    );
  }

  const rules = rulesData?.rules ?? [];
  const events = eventsData?.events ?? [];

  return (
    <div className="space-y-6 p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Alert Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure automated alerts triggered by forecast and risk conditions.
          </p>
        </div>
        <Button
          onClick={() => { setEditingRule(null); setSheetOpen(true); }}
          data-testid="button-new-alert-rule"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Rule
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rules</CardTitle>
          <CardDescription className="text-xs">Active alert rules for your workspace</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rulesLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Throttle</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`row-alert-rule-${rule.id}`}>
                    <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {RULE_TYPES.find(rt => rt.value === rule.ruleType)?.label ?? rule.ruleType}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(rule.severity)} className="text-xs">
                        {rule.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{rule.throttleMinutes}m</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rule.deliveryChannels.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.isEnabled}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({ id: rule.id, values: { isEnabled: checked } })
                        }
                        data-testid={`switch-rule-enabled-${rule.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditingRule(rule); setSheetOpen(true); }}
                          data-testid={`button-edit-rule-${rule.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(rule.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-rule-${rule.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10 text-sm">
                      No alert rules configured. Click "New Rule" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Alert Events
          </CardTitle>
          <CardDescription className="text-xs">Recent triggered alert events</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {eventsLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Triggered At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow
                    key={event.id}
                    data-testid={`row-alert-event-${event.id}`}
                    className={cn(event.isAcknowledged && "opacity-60")}
                  >
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{event.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.entityType ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(event.severity)} className="text-xs">
                        {event.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(event.triggeredAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {event.isAcknowledged ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          Acknowledged
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Unread</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!event.isAcknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeMutation.mutate(event.id)}
                          disabled={acknowledgeMutation.isPending}
                          data-testid={`button-ack-event-${event.id}`}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10 text-sm">
                      No alert events found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingRule ? "Edit Alert Rule" : "New Alert Rule"}</SheetTitle>
            <SheetDescription>
              {editingRule ? "Update the configuration for this alert rule." : "Configure a new automated alert rule."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <AlertRuleForm
              defaultValues={editingRule ? {
                name: editingRule.name,
                ruleType: editingRule.ruleType,
                severity: editingRule.severity,
                description: editingRule.description ?? "",
                throttleMinutes: editingRule.throttleMinutes,
                deliveryChannels: editingRule.deliveryChannels,
                isEnabled: editingRule.isEnabled,
              } : undefined}
              onSubmit={(values) => {
                if (editingRule) {
                  updateMutation.mutate({ id: editingRule.id, values });
                } else {
                  createMutation.mutate(values);
                }
              }}
              isPending={createMutation.isPending || updateMutation.isPending}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
