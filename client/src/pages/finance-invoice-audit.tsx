import { useState } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Receipt, AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

type AuditStatus = "never_billed" | "overdue" | "ok" | "unmatched";

interface AuditClientRow {
  clientId: string;
  companyName: string;
  website: string | null;
  matchedCustomerName: string | null;
  status: AuditStatus;
  lastHostingInvoiceDate: string | null;
  lastHostingAmount: number | null;
  lastHostingDescription: string | null;
  daysSinceLastHosting: number | null;
  hostingBilled: number;
  lastInvoiceDate: string | null;
  daysSinceLastInvoice: number | null;
  invoiceCount: number;
  totalBilled: number;
  openBalance: number;
}

interface InvoiceAuditResponse {
  generatedAt: string;
  windowStart: string;
  thresholdDays: number;
  windowMonths: number;
  usingTaggedPopulation: boolean;
  taggedClientCount: number;
  quickbooks: { connected: boolean; error?: string };
  wpengine: {
    connected: boolean;
    error?: string;
    installCount?: number;
    productionCount?: number;
    assignedCount?: number;
    unbilledInstalls?: Array<{
      name: string | null;
      primaryDomain: string | null;
      siteName: string | null;
      accountName: string | null;
      assignedCustomer: string | null;
    }>;
  };
  clients: AuditClientRow[];
  unmatchedCustomers: Array<{ customerName: string; invoiceCount: number; totalBilled: number }>;
}

const STATUS_META: Record<AuditStatus, { label: string; className: string }> = {
  never_billed: { label: "No hosting billed", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  overdue: { label: "Hosting overdue", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  unmatched: { label: "Unmatched", className: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
  ok: { label: "OK", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function FinanceInvoiceAuditPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [thresholdDays, setThresholdDays] = useState(45);
  const [windowMonths, setWindowMonths] = useState(12);
  const [includeAll, setIncludeAll] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery<InvoiceAuditResponse>({
    queryKey: ["/api/v1/finance/invoice-audit", { thresholdDays, windowMonths, includeAll }],
    enabled: Boolean(user?.canViewFinance),
    staleTime: 5 * 60 * 1000,
  });

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }
  if (!user?.canViewFinance) {
    return <Redirect to="/" />;
  }

  const counts = { never_billed: 0, overdue: 0, ok: 0, unmatched: 0 };
  for (const row of data?.clients || []) counts[row.status]++;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="finance-invoice-audit-page">
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Invoice Audit</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              "Website Hosting" line items from QuickBooks for WP Engine–hosted clients
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="audit-include-all" className="text-sm text-muted-foreground">All clients</Label>
              <Switch
                id="audit-include-all"
                checked={includeAll}
                onCheckedChange={setIncludeAll}
                data-testid="switch-include-all"
              />
            </div>
            <Select value={String(windowMonths)} onValueChange={(v) => setWindowMonths(Number(v))}>
              <SelectTrigger className="w-36" data-testid="select-window"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 6, 12, 24].map((m) => (
                  <SelectItem key={m} value={String(m)}>Last {m} months</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(thresholdDays)} onValueChange={(v) => setThresholdDays(Number(v))}>
              <SelectTrigger className="w-44" data-testid="select-threshold"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[30, 45, 60, 90].map((d) => (
                  <SelectItem key={d} value={String(d)}>Overdue after {d} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-[1400px] space-y-4">
          {data && !data.quickbooks.connected && (
            <Card className="border-amber-500/40">
              <CardContent className="flex items-center gap-3 py-4 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <span className="font-medium">QuickBooks is not available:</span>{" "}
                  {data.quickbooks.error || "Unknown error"} — connect it under{" "}
                  <Link href="/settings" className="underline">Settings → Integrations</Link>.
                </div>
              </CardContent>
            </Card>
          )}

          {data && !data.usingTaggedPopulation && !includeAll && (
            <Card className="border-sky-500/40">
              <CardContent className="flex items-center gap-3 py-4 text-sm">
                <HelpCircle className="h-5 w-5 shrink-0 text-sky-500" />
                <div>
                  No clients are tagged <code className="rounded bg-muted px-1">wpengine</code> yet, so all
                  active clients are shown. Tag your WP Engine–hosted clients to narrow the audit.
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="No hosting billed" value={counts.never_billed} tone="text-red-500" loading={isLoading} icon={AlertTriangle} />
            <SummaryCard label="Hosting overdue" value={counts.overdue} tone="text-amber-500" loading={isLoading} icon={AlertTriangle} />
            <SummaryCard label="Billed recently" value={counts.ok} tone="text-emerald-500" loading={isLoading} icon={CheckCircle2} />
            <SummaryCard label="Clients audited" value={data?.clients.length ?? 0} tone="text-primary" loading={isLoading} icon={Receipt} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Clients {data?.usingTaggedPopulation ? `(tagged wpengine: ${data.taggedClientCount})` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last hosting invoice</TableHead>
                      <TableHead className="text-right">Days since</TableHead>
                      <TableHead className="text-right">Hosting billed</TableHead>
                      <TableHead>Last invoice (any)</TableHead>
                      <TableHead className="text-right">Total billed</TableHead>
                      <TableHead className="text-right">Open balance</TableHead>
                      <TableHead>QBO customer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.clients || []).map((row) => (
                      <TableRow key={row.clientId} data-testid={`audit-row-${row.clientId}`}>
                        <TableCell className="font-medium">
                          <Link href={`/clients/${row.clientId}`} className="hover:underline">
                            {row.companyName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_META[row.status].className}>
                            {STATUS_META[row.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell title={row.lastHostingDescription ?? undefined}>
                          {row.lastHostingInvoiceDate
                            ? `${row.lastHostingInvoiceDate}${row.lastHostingAmount != null ? ` · ${currency.format(row.lastHostingAmount)}` : ""}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">{row.daysSinceLastHosting ?? "—"}</TableCell>
                        <TableCell className="text-right">{currency.format(row.hostingBilled)}</TableCell>
                        <TableCell>{row.lastInvoiceDate ?? "—"}</TableCell>
                        <TableCell className="text-right">{currency.format(row.totalBilled)}</TableCell>
                        <TableCell className="text-right">
                          {row.openBalance > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400">{currency.format(row.openBalance)}</span>
                          ) : (
                            currency.format(row.openBalance)
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.matchedCustomerName ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && (data?.clients.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          No active clients found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {data && data.unmatchedCustomers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">QuickBooks customers with no matching client</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Billed in QuickBooks during the window but not matched to an audited client — usually a
                  naming mismatch worth reconciling.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>QuickBooks customer</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Total billed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unmatchedCustomers.map((c) => (
                      <TableRow key={c.customerName}>
                        <TableCell className="font-medium">{c.customerName}</TableCell>
                        <TableCell className="text-right">{c.invoiceCount}</TableCell>
                        <TableCell className="text-right">{currency.format(c.totalBilled)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data?.wpengine && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  WP Engine installs with no billing evidence
                  {data.wpengine.connected && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({data.wpengine.unbilledInstalls?.length ?? 0} of {data.wpengine.productionCount} production installs)
                    </span>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {data.wpengine.connected ? (
                    <>
                      Production installs with no hosting line item naming their domain and no assignment
                      to a customer who is billed hosting. Attach installs to their paying customer on{" "}
                      <Link href="/finance/website-matching" className="underline">Website Matching</Link>
                      {typeof data.wpengine.assignedCount === "number"
                        ? ` (${data.wpengine.assignedCount} of ${data.wpengine.productionCount} assigned so far)`
                        : ""}
                      .
                    </>
                  ) : (
                    `WP Engine is not available: ${data.wpengine.error || "not configured"} — connect it under Settings → Integrations.`
                  )}
                </p>
              </CardHeader>
              {data.wpengine.connected && (data.wpengine.unbilledInstalls?.length ?? 0) > 0 && (
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Install</TableHead>
                        <TableHead>Primary domain</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead>Assigned customer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.wpengine.unbilledInstalls ?? []).map((i) => (
                        <TableRow key={`${i.name}-${i.primaryDomain}`}>
                          <TableCell className="font-medium">{i.name ?? "—"}</TableCell>
                          <TableCell>
                            {i.primaryDomain ? (
                              <a href={`https://${i.primaryDomain}`} target="_blank" rel="noreferrer" className="hover:underline">
                                {i.primaryDomain}
                              </a>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{i.accountName ?? i.siteName ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {i.assignedCustomer ? (
                              <span className="text-amber-600 dark:text-amber-400" title="Assigned, but this customer has no hosting line items in the window">
                                {i.assignedCustomer}
                              </span>
                            ) : (
                              <Link href="/finance/website-matching" className="text-xs underline">assign</Link>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          )}

          {data && (
            <p className="text-xs text-muted-foreground">
              Window since {data.windowStart} · generated {new Date(data.generatedAt).toLocaleString()}
              {data.wpengine?.connected ? ` · ${data.wpengine.installCount} WP Engine installs` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  loading,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  loading: boolean;
  icon: typeof Receipt;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-7 w-10" /> : <p className="text-2xl font-semibold">{value}</p>}
        </div>
        <Icon className={`h-6 w-6 ${tone}`} />
      </CardContent>
    </Card>
  );
}
