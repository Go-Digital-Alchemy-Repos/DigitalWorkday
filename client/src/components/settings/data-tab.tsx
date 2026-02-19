import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Download, Loader2 } from "lucide-react";
import { DataImportWizard } from "@/components/super-admin/data-import-wizard";
import { AsanaImportWizard } from "@/components/super-admin/asana-import-wizard";

export function DataTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  const tenantId = user?.tenantId || "";
  const tenantSlug = tenantId;
  const apiBasePath = "/api/v1/tenant/data";

  const handleExport = async (type: "clients" | "users" | "time-entries") => {
    setIsExporting(true);
    try {
      const response = await fetch(`${apiBasePath}/export/${type}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Export Complete",
        description: `${type} exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4" />
            Quick Export
          </CardTitle>
          <CardDescription>Download your organization data as CSV files</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => handleExport("clients")}
              disabled={isExporting}
              data-testid="button-export-clients"
            >
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Clients
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("users")}
              disabled={isExporting}
              data-testid="button-export-users"
            >
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Team Members
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("time-entries")}
              disabled={isExporting}
              data-testid="button-export-time-entries"
            >
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Time Entries
            </Button>
          </div>
        </CardContent>
      </Card>

      <DataImportWizard tenantId={tenantId} tenantSlug={tenantSlug} apiBasePath={apiBasePath} />

      <Separator />

      <AsanaImportWizard tenantId={tenantId} apiBasePath={apiBasePath} />
    </div>
  );
}
