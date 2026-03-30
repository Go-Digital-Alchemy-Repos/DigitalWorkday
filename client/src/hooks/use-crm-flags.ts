import { useQuery } from "@tanstack/react-query";
import { tenantKey, STALE_TIMES } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export interface CrmFlags {
  client360: boolean;
  contacts: boolean;
  timeline: boolean;
  portal: boolean;
  files: boolean;
  approvals: boolean;
  clientMessaging: boolean;
}

const ALL_OFF: CrmFlags = {
  client360: false,
  contacts: false,
  timeline: false,
  portal: false,
  files: false,
  approvals: false,
  clientMessaging: false,
};

export function useCrmFlags(): CrmFlags {
  const { data } = useQuery<CrmFlags>({
    queryKey: tenantKey(queryKeys.crm.flags),
    staleTime: STALE_TIMES.slow,
    refetchOnWindowFocus: false,
  });
  return data ?? ALL_OFF;
}

export function useAnyCrmEnabled(): boolean {
  const flags = useCrmFlags();
  return Object.values(flags).some(Boolean);
}
