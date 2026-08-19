import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export type PortalCapabilities = {
  viewAccount: boolean;
  manageTasks: boolean;
  completeTasks: boolean;
  useMessages: boolean;
  useApprovals: boolean;
  useSupport: boolean;
  manageClientVisibleAssets: boolean;
  manageProjects: boolean;
  viewActivity: boolean;
  editOverview: boolean;
  editContacts: boolean;
  managePortalUsers: boolean;
};

export type PortalClient = {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: "collaborator" | "client_admin";
  status: "active" | "suspended";
  capabilities: PortalCapabilities;
};

type Dashboard = { clients: PortalClient[] };

export function usePortalClient() {
  const { data, isLoading } = useQuery<Dashboard>({ queryKey: queryKeys.portal.dashboard });
  const clients = data?.clients || [];
  const [clientId, setClientId] = useState(() => localStorage.getItem("portal-client-id") || "");
  useEffect(() => {
    if (!clients.length) return;
    if (!clients.some((client) => client.id === clientId)) setClientId(clients[0].id);
  }, [clients, clientId]);
  useEffect(() => {
    if (clientId) localStorage.setItem("portal-client-id", clientId);
  }, [clientId]);
  const client = useMemo(() => clients.find((item) => item.id === clientId) || clients[0] || null, [clients, clientId]);
  return { clients, client, clientId: client?.id || "", setClientId, isLoading };
}
