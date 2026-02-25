import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const SNAPSHOT_TYPES = [
  { value: "capacity_overload", label: "Capacity Overload" },
  { value: "project_deadline_risk", label: "Project Deadline Risk" },
  { value: "client_risk_trend", label: "Client Risk Trend" },
];

const snapshotSchema = z.object({
  snapshotType: z.string().min(1, "Type is required"),
  horizonWeeks: z.coerce.number().min(1).max(12).default(4),
});

type SnapshotFormValues = z.infer<typeof snapshotSchema>;

interface ForecastSnapshot {
  id: string;
  snapshotType: string;
  asOfDate: string;
  horizonWeeks: number;
  confidence: "Low" | "Medium" | "High" | null;
  createdAt: string;
  createdByUserId: string | null;
}

function confidenceVariant(confidence: string | null): "default" | "secondary" | "destructive" {
  if (confidence === "High") return "default";
  if (confidence === "Medium") return "secondary";
  return "destructive";
}

function snapshotTypeLabel(type: string): string {
  return SNAPSHOT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function ForecastSnapshotsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<{ snapshots: ForecastSnapshot[]; total: number; hasMore: boolean }>({
    queryKey: ["/api/reports/v2/forecasting/snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/reports/v2/forecasting/snapshots?limit=20");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const form = useForm<SnapshotFormValues>({
    resolver: zodResolver(snapshotSchema),
    defaultValues: {
      snapshotType: "",
      horizonWeeks: 4,
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: SnapshotFormValues) =>
      apiRequest("POST", "/api/reports/v2/forecasting/snapshots", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/v2/forecasting/snapshots"] });
      toast({ title: "Snapshot created" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => toast({ title: "Failed to create snapshot", variant: "destructive" }),
  });

  const snapshots = data?.snapshots ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-medium">Forecast Snapshots</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Point-in-time forecast captures you can compare over time or export.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          data-testid="button-take-snapshot"
        >
          <Camera className="h-4 w-4 mr-1" />
          Take Snapshot
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Snapshot History</CardTitle>
          <CardDescription className="text-xs">Previously captured forecast snapshots</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>As Of</TableHead>
                  <TableHead>Horizon Weeks</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snap) => (
                  <TableRow key={snap.id} data-testid={`row-snapshot-${snap.id}`}>
                    <TableCell className="font-medium text-sm">{snapshotTypeLabel(snap.snapshotType)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {snap.asOfDate ? new Date(snap.asOfDate).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{snap.horizonWeeks}w</TableCell>
                    <TableCell>
                      {snap.confidence ? (
                        <Badge variant={confidenceVariant(snap.confidence)} className="text-xs">
                          {snap.confidence}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(snap.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`/api/reports/v2/forecasting/snapshots/${snap.id}/export?format=csv`}
                        download
                        data-testid={`link-export-snapshot-${snap.id}`}
                      >
                        <Button size="icon" variant="ghost">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
                {snapshots.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10 text-sm">
                      No snapshots yet. Click "Take Snapshot" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take Forecast Snapshot</DialogTitle>
            <DialogDescription>
              Capture a point-in-time forecast for later comparison or export.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4 mt-2"
            >
              <FormField
                control={form.control}
                name="snapshotType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Snapshot Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-snapshot-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SNAPSHOT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="horizonWeeks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horizon Weeks</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                      <FormControl>
                        <SelectTrigger data-testid="select-snapshot-horizon">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="2">2 weeks</SelectItem>
                        <SelectItem value="4">4 weeks</SelectItem>
                        <SelectItem value="8">8 weeks</SelectItem>
                        <SelectItem value="12">12 weeks</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel-snapshot"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-confirm-snapshot"
                >
                  {createMutation.isPending ? "Creating…" : "Create Snapshot"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
