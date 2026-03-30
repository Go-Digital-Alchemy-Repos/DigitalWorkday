import { useQuery } from "@tanstack/react-query";
import { tenantKey, STALE_TIMES } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export interface FeatureFlags {
  assetLibraryV2: boolean;
  clientWorkspaceV2: boolean;
  documentsUsingAssets: boolean;
  clientProfileLayoutV2: boolean;
  clientCommandPaletteV1: boolean;
  notificationsGroupingV1: boolean;
  prefetchV1: boolean;
  virtualizationV1: boolean;
  tenantDefaultDocs: boolean;
  reportingEngineEnabled: boolean;
  reportWorkloadV2: boolean;
  reportTaskAnalysisV2: boolean;
  reportClientAnalyticsV2: boolean;
  reportTimeTrackingV2: boolean;
  reportProjectAnalysisV2: boolean;
  reportPipelineV2: boolean;
  enableEmployeeCommandCenter: boolean;
  enableClientCommandCenter: boolean;
  enableEmployeePerformanceIndex: boolean;
  enableClientHealthIndex: boolean;
  enableForecastingLayer: boolean;
  enableForecastingAlerts: boolean;
  enableForecastSnapshots: boolean;
  enableAlertAutomation: boolean;
  enableWeeklyOpsDigest: boolean;
  enableTaskReviewQueue: boolean;
  enableProjectMilestones: boolean;
  enablePmPortfolioDashboard: boolean;
  enableReassignmentSuggestions: boolean;
  enableCapacityWhatIf: boolean;
  enableWhatifSnapshots: boolean;
  enableRiskAckWorkflow: boolean;
  enableAiPmFocusSummary: boolean;
  enableBillingApprovalWorkflow: boolean;
  enableInvoiceDraftBuilder: boolean;
  enableClientProfitability: boolean;
  enableQuickbooksSync: boolean;
  enableQuickbooksClientMapping: boolean;
  enableQuickbooksCustomerImport: boolean;
  enableQuickbooksMappingSuggestions: boolean;
}

const ALL_OFF: FeatureFlags = {
  assetLibraryV2: false,
  clientWorkspaceV2: false,
  documentsUsingAssets: false,
  clientProfileLayoutV2: false,
  clientCommandPaletteV1: false,
  notificationsGroupingV1: false,
  prefetchV1: false,
  virtualizationV1: false,
  tenantDefaultDocs: false,
  reportingEngineEnabled: false,
  reportWorkloadV2: false,
  reportTaskAnalysisV2: false,
  reportClientAnalyticsV2: false,
  reportTimeTrackingV2: false,
  reportProjectAnalysisV2: false,
  reportPipelineV2: false,
  enableEmployeeCommandCenter: false,
  enableClientCommandCenter: false,
  enableEmployeePerformanceIndex: false,
  enableClientHealthIndex: false,
  enableForecastingLayer: false,
  enableForecastingAlerts: false,
  enableForecastSnapshots: false,
  enableAlertAutomation: false,
  enableWeeklyOpsDigest: false,
  enableTaskReviewQueue: false,
  enableProjectMilestones: false,
  enablePmPortfolioDashboard: false,
  enableReassignmentSuggestions: false,
  enableCapacityWhatIf: false,
  enableWhatifSnapshots: false,
  enableRiskAckWorkflow: false,
  enableAiPmFocusSummary: false,
  enableBillingApprovalWorkflow: false,
  enableInvoiceDraftBuilder: false,
  enableClientProfitability: false,
  enableQuickbooksSync: false,
  enableQuickbooksClientMapping: false,
  enableQuickbooksCustomerImport: false,
  enableQuickbooksMappingSuggestions: false,
};

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery<FeatureFlags>({
    queryKey: tenantKey(queryKeys.features.flags),
    staleTime: STALE_TIMES.slow,
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
