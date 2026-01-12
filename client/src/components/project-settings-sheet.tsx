import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, X } from "lucide-react";
import type { Project, ClientWithContacts } from "@shared/schema";

interface ProjectSettingsSheetProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettingsSheet({
  project,
  open,
  onOpenChange,
}: ProjectSettingsSheetProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: clients = [] } = useQuery<ClientWithContacts[]>({
    queryKey: ["/api/clients"],
  });

  const assignClientMutation = useMutation({
    mutationFn: async (clientId: string | null) => {
      return apiRequest("PATCH", `/api/projects/${project.id}/client`, { clientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Client updated",
        description: "Project client assignment has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update client assignment.",
        variant: "destructive",
      });
    },
  });

  const currentClient = clients.find((c) => c.id === project.clientId);

  const handleAssignClient = (clientId: string) => {
    if (clientId === "unassign") {
      assignClientMutation.mutate(null);
    } else {
      assignClientMutation.mutate(clientId);
    }
  };

  const handleUnassign = () => {
    assignClientMutation.mutate(null);
  };

  const filteredClients = clients.filter(
    (c) =>
      c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Project Settings</SheetTitle>
          <SheetDescription>
            Configure project settings and client assignment.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Client</Label>
            <div className="space-y-3">
              {currentClient ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{currentClient.companyName}</p>
                      {currentClient.displayName && (
                        <p className="text-xs text-muted-foreground">
                          {currentClient.displayName}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUnassign}
                    disabled={assignClientMutation.isPending}
                    data-testid="button-unassign-client"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Unassign
                  </Button>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-dashed text-center">
                  <p className="text-sm text-muted-foreground">No client assigned</p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {currentClient ? "Change Client" : "Assign Client"}
                </Label>
                <Select
                  onValueChange={handleAssignClient}
                  disabled={assignClientMutation.isPending}
                >
                  <SelectTrigger data-testid="select-project-client">
                    <SelectValue placeholder="Select a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {currentClient && (
                      <SelectItem value="unassign">
                        <span className="text-muted-foreground">Unassign client</span>
                      </SelectItem>
                    )}
                    {filteredClients.map((client) => (
                      <SelectItem
                        key={client.id}
                        value={client.id}
                        disabled={client.id === project.clientId}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5" />
                          {client.companyName}
                        </div>
                      </SelectItem>
                    ))}
                    {filteredClients.length === 0 && (
                      <div className="py-2 px-2 text-sm text-muted-foreground text-center">
                        No clients available
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
