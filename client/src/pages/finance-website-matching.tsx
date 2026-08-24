import { useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Globe,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface InstallRow {
  id: string;
  name: string | null;
  primaryDomain: string | null;
  siteName: string | null;
  accountName: string | null;
  assignment: {
    customerName: string;
    clientId: string | null;
    source: string;
    notes: string | null;
  } | null;
  suggestion: {
    customerName: string;
    confidence: "high" | "medium";
    evidence: string;
  } | null;
}

interface WebsiteAssignmentsResponse {
  generatedAt: string;
  windowMonths: number;
  quickbooks: { connected: boolean; error?: string };
  wpengine: { connected: boolean; error?: string };
  customers: string[];
  customersWithHosting: string[];
  clients: Array<{ id: string; name: string }>;
  installs: InstallRow[];
}

type RowFilter = "all" | "unassigned" | "suggested" | "assigned";

const ASSIGNMENTS_KEY = "/api/v1/finance/website-assignments";
const AUDIT_KEY = "/api/v1/finance/invoice-audit";

export default function FinanceWebsiteMatchingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<RowFilter>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery<WebsiteAssignmentsResponse>({
    queryKey: [ASSIGNMENTS_KEY],
    enabled: Boolean(user?.canViewFinance),
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [ASSIGNMENTS_KEY] });
    queryClient.invalidateQueries({ queryKey: [AUDIT_KEY] });
  };

  const assignMutation = useMutation({
    mutationFn: async (input: { install: InstallRow; customerName: string; source: string }) => {
      await apiRequest("PUT", `${ASSIGNMENTS_KEY}/${input.install.id}`, {
        customerName: input.customerName,
        installName: input.install.name,
        primaryDomain: input.install.primaryDomain,
        source: input.source,
      });
    },
    onSuccess: (_result, input) => {
      toast({ title: `Assigned ${input.install.primaryDomain ?? input.install.name} to ${input.customerName}` });
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Assignment failed", description: error.message, variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: async (install: InstallRow) => {
      await apiRequest("DELETE", `${ASSIGNMENTS_KEY}/${install.id}`);
    },
    onSuccess: (_result, install) => {
      toast({ title: `Cleared assignment for ${install.primaryDomain ?? install.name}` });
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Clear failed", description: error.message, variant: "destructive" }),
  });

  const bulkMutation = useMutation({
    mutationFn: async (installs: InstallRow[]) => {
      await apiRequest("POST", `${ASSIGNMENTS_KEY}/bulk`, {
        assignments: installs.map((install) => ({
          wpeInstallId: install.id,
          customerName: install.suggestion!.customerName,
          installName: install.name,
          primaryDomain: install.primaryDomain,
          source: "suggestion_accepted",
        })),
      });
      return installs.length;
    },
    onSuccess: (count) => {
      toast({ title: `Accepted ${count} high-confidence suggestions` });
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Bulk accept failed", description: error.message, variant: "destructive" }),
  });

  const installs = data?.installs ?? [];
  const counts = useMemo(() => {
    const assigned = installs.filter((i) => i.assignment).length;
    const suggested = installs.filter((i) => !i.assignment && i.suggestion).length;
    return {
      assigned,
      suggested,
      unknown: installs.length - assigned - suggested,
      highPending: installs.filter((i) => !i.assignment && i.suggestion?.confidence === "high").length,
    };
  }, [installs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return installs.filter((install) => {
      if (filter === "assigned" && !install.assignment) return false;
      if (filter === "unassigned" && install.assignment) return false;
      if (filter === "suggested" && (install.assignment || !install.suggestion)) return false;
      if (!q) return true;
      const blob = [
        install.name,
        install.primaryDomain,
        install.siteName,
        install.accountName,
        install.assignment?.customerName,
        install.suggestion?.customerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [installs, filter, search]);

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }
  if (!user?.canViewFinance) {
    return <Redirect to="/" />;
  }

  const hostedCustomers = new Set(data?.customersWithHosting ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="finance-website-matching-page">
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Website Matching</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Attach each WP Engine production install to the QuickBooks customer who pays for it.
              Suggestions are computed from invoices, dedicated servers, and name matching — accept
              them or pick a customer yourself. See the{" "}
              <Link href="/finance/invoice-audit" className="underline">Invoice Audit</Link> for the
              billing gaps this feeds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {counts.highPending > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => bulkMutation.mutate(installs.filter((i) => !i.assignment && i.suggestion?.confidence === "high"))}
                disabled={bulkMutation.isPending}
                data-testid="button-accept-high"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Accept {counts.highPending} high-confidence
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-[1400px] space-y-4">
          {data && (!data.wpengine.connected || !data.quickbooks.connected) && (
            <Card className="border-amber-500/40">
              <CardContent className="flex items-center gap-3 py-4 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  {!data.wpengine.connected && (
                    <div>
                      <span className="font-medium">WP Engine is not available:</span>{" "}
                      {data.wpengine.error || "not configured"}
                    </div>
                  )}
                  {!data.quickbooks.connected && (
                    <div>
                      <span className="font-medium">QuickBooks is not available:</span>{" "}
                      {data.quickbooks.error || "not configured"} — suggestions and the customer list
                      need it.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Production installs" value={installs.length} loading={isLoading} />
            <StatCard label="Assigned" value={counts.assigned} tone="text-emerald-500" loading={isLoading} />
            <StatCard label="Suggested (unconfirmed)" value={counts.suggested} tone="text-sky-500" loading={isLoading} />
            <StatCard label="Needs manual review" value={counts.unknown} tone="text-amber-500" loading={isLoading} />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Installs</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search domain, install, customer…"
                  className="w-64"
                  data-testid="input-install-search"
                />
                <Select value={filter} onValueChange={(v) => setFilter(v as RowFilter)}>
                  <SelectTrigger className="w-44" data-testid="select-install-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All installs</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    <SelectItem value="suggested">With suggestion</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Primary domain</TableHead>
                      <TableHead>Install</TableHead>
                      <TableHead>Server</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead className="w-40 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((install) => (
                      <TableRow key={install.id} data-testid={`install-row-${install.id}`}>
                        <TableCell className="font-medium">
                          {install.primaryDomain ? (
                            <a href={`https://${install.primaryDomain}`} target="_blank" rel="noreferrer" className="hover:underline">
                              {install.primaryDomain}
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {install.name ?? "—"}
                          {install.siteName ? <span className="block text-xs">site: {install.siteName}</span> : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{install.accountName ?? "—"}</TableCell>
                        <TableCell>
                          <CustomerPicker
                            install={install}
                            customers={data?.customers ?? []}
                            hostedCustomers={hostedCustomers}
                            onPick={(customerName) => assignMutation.mutate({ install, customerName, source: "manual" })}
                            disabled={assignMutation.isPending}
                          />
                        </TableCell>
                        <TableCell className="max-w-72 text-sm text-muted-foreground">
                          {install.assignment ? (
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              {install.assignment.source === "suggestion_accepted" ? "Suggestion accepted" : "Assigned manually"}
                            </Badge>
                          ) : install.suggestion ? (
                            <span title={install.suggestion.evidence}>
                              <Badge
                                variant="secondary"
                                className={
                                  install.suggestion.confidence === "high"
                                    ? "mr-1.5 bg-sky-500/15 text-sky-600 dark:text-sky-400"
                                    : "mr-1.5 bg-slate-500/15 text-slate-600 dark:text-slate-400"
                                }
                              >
                                {install.suggestion.confidence}
                              </Badge>
                              {install.suggestion.evidence}
                            </span>
                          ) : (
                            "No suggestion — needs manual review"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!install.assignment && install.suggestion && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                assignMutation.mutate({
                                  install,
                                  customerName: install.suggestion!.customerName,
                                  source: "suggestion_accepted",
                                })
                              }
                              disabled={assignMutation.isPending}
                              data-testid={`button-accept-${install.id}`}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              Accept
                            </Button>
                          )}
                          {install.assignment && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => clearMutation.mutate(install)}
                              disabled={clearMutation.isPending}
                              data-testid={`button-clear-${install.id}`}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Clear
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {visible.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No installs match the current filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {data && (
            <p className="text-xs text-muted-foreground">
              Suggestions use the last {data.windowMonths} months of QuickBooks invoices · generated{" "}
              {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerPicker({
  install,
  customers,
  hostedCustomers,
  onPick,
  disabled,
}: {
  install: InstallRow;
  customers: string[];
  hostedCustomers: Set<string>;
  onPick: (customerName: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = install.assignment?.customerName ?? null;
  const suggested = !current && install.suggestion ? install.suggestion.customerName : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="sm"
          disabled={disabled}
          className={cn("w-56 justify-between font-normal", !current && "text-muted-foreground")}
          data-testid={`picker-${install.id}`}
        >
          <span className="truncate">
            {current ?? (suggested ? `Suggested: ${suggested}` : "Assign customer…")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search customers…" />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {customers.map((customer) => (
                <CommandItem
                  key={customer}
                  value={customer}
                  onSelect={() => {
                    setOpen(false);
                    if (customer !== current) onPick(customer);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", customer === current ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{customer}</span>
                  {hostedCustomers.has(customer) && (
                    <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">hosting</Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function StatCard({
  label,
  value,
  tone = "text-primary",
  loading,
}: {
  label: string;
  value: number;
  tone?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-7 w-10" /> : <p className={`text-2xl font-semibold ${tone}`}>{value}</p>}
      </CardContent>
    </Card>
  );
}
