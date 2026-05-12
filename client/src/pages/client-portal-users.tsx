import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalUsersTab } from "@/components/client-portal-users-tab";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface PortalProfileData {
  clients: ClientInfo[];
}

export default function ClientPortalUsersPage() {
  const [clientId, setClientId] = useState("");
  const { data, isLoading } = useQuery<PortalProfileData>({
    queryKey: ["/api/client-portal/profile"],
  });

  const manageableClients = data?.clients || [];
  const selectedClient = manageableClients.find(client => client.id === clientId);

  useEffect(() => {
    if (!clientId && manageableClients.length > 0) {
      setClientId(manageableClients[0].id);
    }
  }, [clientId, manageableClients]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 overflow-y-auto h-full">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Portal Users
          </h1>
          <p className="text-muted-foreground">
            {selectedClient?.accessLevel === "portal_admin"
              ? "Invite and manage users who can access this client portal."
              : "View users who can access this client portal."}
          </p>
        </div>
        {manageableClients.length > 1 && (
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {manageableClients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.displayName || client.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {clientId ? (
        <ClientPortalUsersTab clientId={clientId} portalMode currentAccessLevel={selectedClient?.accessLevel} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No client accounts available</CardTitle>
            <CardDescription>You need access to a client account before you can manage portal users.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Contact your Digital Workday team if you need access to this portal.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
