import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Phone,
  FileText,
  Bell,
  Flag,
  MessageSquare,
  Plus,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface TimelineEvent {
  id: string;
  eventType: string;
  eventDescription: string | null;
  createdByName: string | null;
  projectName: string | null;
  clientName: string | null;
  createdAt: string;
}

const EVENT_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  status_report_sent: {
    label: "Status Report Sent",
    icon: FileText,
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300",
  },
  client_contact_logged: {
    label: "Client Contact Logged",
    icon: Phone,
    color: "text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-300",
  },
  follow_up_created: {
    label: "Follow-Up Created",
    icon: Bell,
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-300",
  },
  milestone_update: {
    label: "Milestone Update",
    icon: Flag,
    color: "text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-300",
  },
  client_email_sent: {
    label: "Email Sent",
    icon: Mail,
    color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300",
  },
  manual_note: {
    label: "Note",
    icon: MessageSquare,
    color: "text-slate-600 bg-slate-50 dark:bg-slate-800 dark:text-slate-300",
  },
};

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

function TimelineEventRow({ event, showProject }: { event: TimelineEvent; showProject?: boolean }) {
  const meta = EVENT_META[event.eventType] ?? {
    label: event.eventType.replace(/_/g, " "),
    icon: MessageSquare,
    color: "text-slate-600 bg-slate-50 dark:bg-slate-800",
  };
  const Icon = meta.icon;

  return (
    <div className="flex gap-3 group" data-testid={`timeline-event-${event.id}`}>
      <div className="flex flex-col items-center">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="w-px flex-1 bg-border group-last:hidden mt-1" />
      </div>
      <div className="pb-5 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{meta.label}</span>
          {showProject && event.projectName && (
            <Badge variant="outline" className="text-xs font-normal">
              {event.projectName}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
        {event.eventDescription && (
          <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{event.eventDescription}</p>
        )}
        {event.createdByName && (
          <p className="text-xs text-muted-foreground/70 mt-1">by {event.createdByName}</p>
        )}
      </div>
    </div>
  );
}

interface LogEventFormProps {
  projectId: string;
  clientId?: string | null;
  onSuccess: () => void;
}

function LogEventForm({ projectId, clientId, onSuccess }: LogEventFormProps) {
  const [eventType, setEventType] = useState("manual_note");
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/projects/${projectId}/communication-events`, {
        eventType,
        eventDescription: description.trim() || null,
        clientId: clientId ?? null,
      });
    },
    onSuccess: () => {
      toast({ title: "Event logged" });
      setDescription("");
      setEventType("manual_note");
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to log event", variant: "destructive" });
    },
  });

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30" data-testid="log-event-form">
      <div className="flex gap-2">
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-48 h-8 text-xs" data-testid="select-event-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual_note">Note</SelectItem>
            <SelectItem value="client_contact_logged">Client Contact</SelectItem>
            <SelectItem value="client_email_sent">Email Sent</SelectItem>
            <SelectItem value="follow_up_created">Follow-Up</SelectItem>
            <SelectItem value="milestone_update">Milestone Update</SelectItem>
            <SelectItem value="status_report_sent">Status Report</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Textarea
        placeholder="Add a description (optional)…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="text-sm min-h-[60px] resize-none"
        data-testid="input-event-description"
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="button-log-event"
        >
          {mutation.isPending ? "Logging…" : "Log Event"}
        </Button>
      </div>
    </div>
  );
}

// ── Project-scoped timeline ───────────────────────────────────────────────────

interface ProjectCommunicationTimelineProps {
  projectId: string;
  clientId?: string | null;
}

export function ProjectCommunicationTimeline({ projectId, clientId }: ProjectCommunicationTimelineProps) {
  const [showForm, setShowForm] = useState(false);
  const { user } = useAuth();
  const canLog = ["super_user", "tenant_owner", "admin", "employee"].includes((user as any)?.role ?? "");

  const { data: events = [], isLoading, refetch } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/projects", projectId, "communication-events"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/communication-events`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="project-communication-timeline">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Communication Timeline</h3>
          <p className="text-xs text-muted-foreground">{events.length} event{events.length !== 1 ? "s" : ""} recorded</p>
        </div>
        {canLog && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            data-testid="button-toggle-log-form"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Log Event
          </Button>
        )}
      </div>

      {showForm && (
        <LogEventForm
          projectId={projectId}
          clientId={clientId}
          onSuccess={() => {
            setShowForm(false);
            refetch();
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "communication-events"] });
          }}
        />
      )}

      {events.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No communication events yet.</p>
          {canLog && (
            <p className="text-xs mt-1">Use "Log Event" to start tracking client communication.</p>
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {events.map((event) => (
            <TimelineEventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client-scoped timeline (across all projects) ─────────────────────────────

interface ClientCommunicationTimelineProps {
  clientId: string;
}

export function ClientCommunicationTimeline({ clientId }: ClientCommunicationTimelineProps) {
  const { data: events = [], isLoading } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/clients", clientId, "communication-events"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/communication-events`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="client-timeline-empty">
        <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-25" />
        <p className="text-sm font-medium">No communication history yet</p>
        <p className="text-xs mt-1">Events are logged from individual project communication tabs.</p>
      </div>
    );
  }

  return (
    <div data-testid="client-communication-timeline">
      <p className="text-xs text-muted-foreground mb-4">
        {events.length} event{events.length !== 1 ? "s" : ""} across all projects
      </p>
      <div className="space-y-0">
        {events.map((event) => (
          <TimelineEventRow key={event.id} event={event} showProject />
        ))}
      </div>
    </div>
  );
}
