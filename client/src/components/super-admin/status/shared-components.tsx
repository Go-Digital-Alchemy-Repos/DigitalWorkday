import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StatusIcon({ status }: { status: "healthy" | "unhealthy" | "unknown" | "not_configured" }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "unhealthy":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "not_configured":
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  }
}

export function StatusBadge({ status }: { status: "healthy" | "unhealthy" | "unknown" | "not_configured" }) {
  const variants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    healthy: "default",
    unhealthy: "destructive",
    not_configured: "outline",
    unknown: "secondary",
  };
  return <Badge variant={variants[status] || "secondary"}>{status.replace("_", " ")}</Badge>;
}

export function DiagnosticIcon({ ok }: { ok: boolean }) {
  return ok 
    ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
    : <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
}

export function WarningIcon() {
  return <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
}
