import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Loader2, Database, CheckCircle, XCircle, AlertTriangle, Search, Archive, Building2, FileWarning, Copy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { DbIntrospectResponse } from "./types";

export function DbIntrospectPanel({ onNavigateTab, onNavigateLogsSubTab }: { onNavigateTab: (tab: string) => void; onNavigateLogsSubTab: (tab: string) => void }) {
  const { toast } = useToast();
  const [introspectData, setIntrospectData] = useState<DbIntrospectResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runIntrospect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest("GET", "/api/v1/super/system/db-introspect");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Failed to run introspection");
      }
      const data = await response.json();
      setIntrospectData(data);
      toast({ title: "DB introspection completed" });
    } catch (err: any) {
      setError(err.message || "Failed to run introspection");
      toast({ title: "Introspection failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const copyJson = () => {
    if (introspectData) {
      navigator.clipboard.writeText(JSON.stringify(introspectData, null, 2));
      toast({ title: "JSON copied to clipboard" });
    }
  };

  const downloadJson = () => {
    if (introspectData) {
      const blob = new Blob([JSON.stringify(introspectData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `db-introspect-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "JSON downloaded" });
    }
  };

  const hasSchemaDrift = introspectData?.summary?.hasSchemaDrift || false;

  return (
    <div className="space-y-6">
      {hasSchemaDrift && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Schema drift detected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Migrations may be missing in production. Review the failed checks below.
            </p>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => { onNavigateTab("logs"); onNavigateLogsSubTab("error"); }} data-testid="link-error-logs">
                <FileWarning className="h-4 w-4 mr-2" />
                Open Error Log
              </Button>
              <Button variant="outline" size="sm" onClick={() => onNavigateTab("tenant-health")} data-testid="link-tenant-health">
                <Building2 className="h-4 w-4 mr-2" />
                Tenant Health & Repair
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            DB Introspect
          </CardTitle>
          <CardDescription>
            Read-only introspection of database schema. Checks for required tables, columns, and multi-tenancy configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-6">
            <Button 
              onClick={runIntrospect} 
              disabled={isLoading}
              data-testid="button-run-introspect"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Run DB Introspect
            </Button>
            {introspectData && (
              <>
                <Button variant="outline" onClick={copyJson} data-testid="button-copy-json">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy JSON
                </Button>
                <Button variant="outline" onClick={downloadJson} data-testid="button-download-json">
                  <Archive className="h-4 w-4 mr-2" />
                  Download JSON
                </Button>
              </>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-4">
              <p className="text-destructive font-medium">{error}</p>
            </div>
          )}

          {introspectData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{introspectData.summary.totalTables}</div>
                    <p className="text-xs text-muted-foreground">Total Tables</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{introspectData.summary.checkedTables}</div>
                    <p className="text-xs text-muted-foreground">Checked Tables</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-green-600">{introspectData.summary.passedChecks}</div>
                    <p className="text-xs text-muted-foreground">Passed Checks</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className={`text-2xl font-bold ${introspectData.summary.failedChecks > 0 ? "text-destructive" : "text-green-600"}`}>
                      {introspectData.summary.failedChecks}
                    </div>
                    <p className="text-xs text-muted-foreground">Failed Checks</p>
                  </CardContent>
                </Card>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>Generated: {new Date(introspectData.generatedAt).toLocaleString()}</p>
                <p>Database: {introspectData.database.hostHint} / {introspectData.database.nameHint}</p>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Required Checks</h3>
                <div className="space-y-2">
                  {introspectData.requiredChecks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      {check.ok ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className={check.ok ? "" : "text-destructive font-medium"}>{check.check}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Tables</h3>
                <Accordion type="multiple" className="w-full">
                  {introspectData.tables.map((table) => (
                    <AccordionItem key={table.name} value={table.name}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          {table.exists ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className={table.exists ? "" : "text-destructive"}>{table.name}</span>
                          {table.missingColumns.length > 0 && (
                            <Badge variant="destructive" className="ml-2">
                              {table.missingColumns.length} missing columns
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-6 space-y-2">
                          <div>
                            <p className="text-sm font-medium">Columns ({table.columns.length})</p>
                            <p className="text-sm text-muted-foreground">{table.columns.join(", ") || "No columns found"}</p>
                          </div>
                          {table.missingColumns.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-destructive">Missing Columns</p>
                              <p className="text-sm text-destructive">{table.missingColumns.join(", ")}</p>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
