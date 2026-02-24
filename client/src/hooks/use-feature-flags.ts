import { useQuery } from "@tanstack/react-query";

export interface FeatureFlags {
  assetLibraryV2: boolean;
  clientWorkspaceV2: boolean;
  documentsUsingAssets: boolean;
  clientProfileLayoutV2: boolean;
  clientCommandPaletteV1: boolean;
  clientControlCenterPremium: boolean;
  clientControlCenterPinnedWidgets: boolean;
  notificationsGroupingV1: boolean;
  prefetchV1: boolean;
  virtualizationV1: boolean;
  tenantDefaultDocs: boolean;
}

const ALL_OFF: FeatureFlags = {
  assetLibraryV2: false,
  clientWorkspaceV2: false,
  documentsUsingAssets: false,
  clientProfileLayoutV2: false,
  clientCommandPaletteV1: false,
  clientControlCenterPremium: false,
  clientControlCenterPinnedWidgets: false,
  notificationsGroupingV1: false,
  prefetchV1: false,
  virtualizationV1: false,
  tenantDefaultDocs: false,
};

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery<FeatureFlags>({
    queryKey: ["/api/features/flags"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return data ?? ALL_OFF;
}

export function useAssetLibraryEnabled(): boolean {
  const flags = useFeatureFlags();
  return flags.assetLibraryV2;
}

export function useClientWorkspaceV2Enabled(): boolean {
  const flags = useFeatureFlags();
  return flags.clientWorkspaceV2;
}
