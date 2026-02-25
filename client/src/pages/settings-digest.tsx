import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const DAYS_OF_WEEK = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`,
}));

const INCLUDE_SECTIONS = [
  { key: "capacity", label: "Team Capacity" },
  { key: "projects", label: "Project Risk" },
  { key: "clients", label: "Client Risk" },
];

const RECIPIENT_SCOPES = [
  { value: "tenant_admins", label: "Tenant Admins" },
  { value: "project_managers", label: "Project Managers" },
  { value: "all_members", label: "All Members" },
];

const digestScheduleSchema = z.object({
  isEnabled: z.boolean().default(false),
  dayOfWeek: z.coerce.number().min(0).max(6).default(1),
  hourLocal: z.coerce.number().min(0).max(23).default(8),
  timezone: z.string().default("UTC"),
  recipientsScope: z.string().default("tenant_admins"),
  includeSections: z.array(z.string()).default(["capacity", "projects", "clients"]),
});

type DigestScheduleValues = z.infer<typeof digestScheduleSchema>;

interface DigestSchedule {
  id?: string;
  isEnabled: boolean;
  dayOfWeek: number;
  hourLocal: number;
  timezone: string;
  recipientsScope: string;
  includeSections: string[];
  lastSentAt: string | null;
}

interface DigestPreview {
  sections: Record<string, unknown>;
  generatedAt: string;
  tenantId: string;
}

export default function DigestConfigPage() {
  const flags = useFeatureFlags();
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<DigestPreview | null>(null);

  const { data: scheduleData, isLoading } = useQuery<{ schedule: DigestSchedule | null }>({
    queryKey: ["/api/reports/v2/digest/schedule"],
    queryFn: async () => {
      const res = await fetch("/api/reports/v2/digest/schedule");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: flags.enableWeeklyOpsDigest,
  });

  const form = useForm<DigestScheduleValues>({
    resolver: zodResolver(digestScheduleSchema),
    values: scheduleData?.schedule
      ? {
          isEnabled: scheduleData.schedule.isEnabled,
          dayOfWeek: scheduleData.schedule.dayOfWeek,
          hourLocal: scheduleData.schedule.hourLocal,
          timezone: scheduleData.schedule.timezone,
          recipientsScope: scheduleData.schedule.recipientsScope,
          includeSections: scheduleData.schedule.includeSections,
        }
      : {
          isEnabled: false,
          dayOfWeek: 1,
          hourLocal: 8,
          timezone: "UTC",
          recipientsScope: "tenant_admins",
          includeSections: ["capacity", "projects", "clients"],
        },
  });

  const saveMutation = useMutation({
    mutationFn: (values: DigestScheduleValues) =>
      apiRequest("PUT", "/api/reports/v2/digest/schedule", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/v2/digest/schedule"] });
      toast({ title: "Digest schedule saved" });
    },
    onError: () => toast({ title: "Failed to save schedule", variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reports/v2/digest/preview", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      setPreviewData(data);
      setPreviewOpen(true);
    },
    onError: () => toast({ title: "Failed to generate preview", variant: "destructive" }),
  });

  if (!flags.enableWeeklyOpsDigest) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Mail className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Weekly Ops Digest is not enabled</p>
        <p className="text-xs">Enable the feature flag to configure digests.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 max-w-2xl mx-auto">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Weekly Ops Digest</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure a scheduled email digest with operational insights.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending}
          data-testid="button-preview-digest"
        >
          <Eye className="h-4 w-4 mr-1" />
          {previewMutation.isPending ? "Generating…" : "Preview Digest"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Schedule Configuration</CardTitle>
          <CardDescription className="text-xs">Control when the digest is sent and to whom</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-5">
              <FormField
                control={form.control}
                name="isEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-digest-enabled"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Enable Weekly Digest</FormLabel>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Week</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-digest-day">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DAYS_OF_WEEK.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hourLocal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Send Hour</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-digest-hour">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {HOURS.map((h) => (
                            <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. America/New_York" {...field} data-testid="input-digest-timezone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recipientsScope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipients</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-digest-recipients">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RECIPIENT_SCOPES.map((rs) => (
                          <SelectItem key={rs.value} value={rs.value}>{rs.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="includeSections"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Include Sections</FormLabel>
                    <div className="flex flex-col gap-2">
                      {INCLUDE_SECTIONS.map((section) => (
                        <div key={section.key} className="flex items-center gap-2">
                          <Checkbox
                            id={`section-${section.key}`}
                            checked={field.value.includes(section.key)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                field.onChange([...field.value, section.key]);
                              } else {
                                field.onChange(field.value.filter((v) => v !== section.key));
                              }
                            }}
                            data-testid={`checkbox-section-${section.key}`}
                          />
                          <label htmlFor={`section-${section.key}`} className="text-sm">
                            {section.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-digest">
                {saveMutation.isPending ? "Saving…" : "Save Schedule"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {scheduleData?.schedule?.lastSentAt && (
        <p className="text-xs text-muted-foreground" data-testid="text-digest-last-sent">
          Last sent: {new Date(scheduleData.schedule.lastSentAt).toLocaleString()}
        </p>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Digest Preview</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Generated at: {new Date(previewData.generatedAt).toLocaleString()}
              </p>
              <pre className="text-xs bg-muted rounded-md p-4 overflow-auto whitespace-pre-wrap" data-testid="text-digest-preview">
                {JSON.stringify(previewData.sections, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
