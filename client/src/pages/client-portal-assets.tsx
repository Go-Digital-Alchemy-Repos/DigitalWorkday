import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssetLibraryPanel } from "@/features/assetLibrary/AssetLibraryPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Library } from "lucide-react";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface DashboardData {
  clients: ClientInfo[];
}

export default function ClientPortalAssetsPage() {
  const [clientId, setClientId] = useState("");
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/client-portal/dashboard"],
  });
  const clients = data?.clients || [];

  useEffect(() => {
    if (!clientId && clients.length > 0) {
      setClientId(clients[0].id);
    }
  }, [clientId, clients]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 overflow-y-auto h-full">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="h-6 w-6 text-primary" />
            Asset Library
          </h1>
          <p className="text-muted-foreground">Upload, organize, and manage assets for your account.</p>
        </div>
        {clients.length > 1 && (
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.displayName || client.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {clientId ? (
        <AssetLibraryPanel clientId={clientId} />
      ) : (
        <div className="py-10 text-center text-muted-foreground">No client accounts are available.</div>
      )}
    </div>
  );
}
