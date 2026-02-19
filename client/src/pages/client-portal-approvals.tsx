import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface ApprovalRequest {
  id: string;
  tenantId: string;
  clientId: string;
  projectId: string | null;
  taskId: string | null;
  requestedByUserId: string;
  title: string;
  instructions: string | null;
  status: string;
  responseComment: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  requesterName: string;
  clientName?: string;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" data-testid="badge-status-pending"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
    case "approved":
      return <Badge variant="default" className="bg-green-600" data-testid="badge-status-approved"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</Badge>;
    case "changes_requested":
      return <Badge variant="destructive" data-testid="badge-status-changes"><AlertTriangle className="h-3 w-3 mr-1" /> Changes Requested</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function ApprovalCard({
  approval,
  onRespond,
  isPending,
}: {
  approval: ApprovalRequest;
  onRespond: (id: string, status: string, comment: string) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const isOverdue = approval.dueAt && isPast(new Date(approval.dueAt)) && approval.status === "pending";

  return (
    <Card className={isOverdue ? "border-destructive/50" : ""} data-testid={`approval-card-${approval.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-medium" data-testid={`approval-title-${approval.id}`}>{approval.title}</h3>
              <StatusBadge status={approval.status} />
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {approval.requesterName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}
              </span>
              {approval.dueAt && (
                <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive font-medium" : ""}`}>
                  <Clock className="h-3 w-3" />
                  Due {format(new Date(approval.dueAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            aria-label="Toggle details"
            data-testid={`button-toggle-${approval.id}`}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4">
            {approval.instructions && (
              <div className="rounded-md bg-muted p-3">
                <div className="flex items-center gap-1 text-sm font-medium mb-1">
                  <FileText className="h-3 w-3" />
                  Instructions
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`approval-instructions-${approval.id}`}>
                  {approval.instructions}
                </p>
              </div>
            )}

            {approval.responseComment && (
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-1 text-sm font-medium mb-1">
                  <MessageSquare className="h-3 w-3" />
                  Response from {approval.respondedByName}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {approval.responseComment}
                </p>
                {approval.respondedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(approval.respondedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </div>
            )}

            {approval.status === "pending" && (
              <div className="space-y-3 border-t pt-3">
                <Textarea
                  placeholder="Add a comment (optional for approval, recommended for change requests)..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="resize-none"
                  rows={3}
                  data-testid={`input-comment-${approval.id}`}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={() => onRespond(approval.id, "approved", comment)}
                    disabled={isPending}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid={`button-approve-${approval.id}`}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => onRespond(approval.id, "changes_requested", comment)}
                    disabled={isPending}
                    data-testid={`button-request-changes-${approval.id}`}
                  >
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Request Changes
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientPortalApprovals() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const { data: approvals = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ["/api/crm/portal/approvals"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, status, responseComment }: { id: string; status: string; responseComment: string }) => {
      const res = await apiRequest("PATCH", `/api/crm/approvals/${id}`, { status, responseComment });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/portal/approvals"] });
      toast({ title: "Response submitted", description: "Your response has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleRespond = (id: string, status: string, comment: string) => {
    respondMutation.mutate({ id, status, responseComment: comment });
  };

  const filtered = approvals.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  if (isLoading) {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="text-muted-foreground">Review and respond to approval requests</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-approvals-title">Approvals</h1>
        <p className="text-muted-foreground">
          Review and respond to approval requests
          {pendingCount > 0 && (
            <span className="ml-1 text-primary font-medium">
              ({pendingCount} pending)
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {["all", "pending", "approved", "changes_requested"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`button-filter-${f}`}
          >
            {f === "all" ? "All" : f === "changes_requested" ? "Changes Requested" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1" data-testid="empty-state-title">
              {filter === "all" ? "No approval requests yet" : `No ${filter.replace("_", " ")} approvals`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "Approval requests from your team will appear here."
                : "Try changing the filter to see other approvals."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onRespond={handleRespond}
              isPending={respondMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
