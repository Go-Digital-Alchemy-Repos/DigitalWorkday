import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Layers,
  Activity,
  StickyNote,
  FileText,
  BarChart3,
  ClipboardCheck,
  MessageSquare,
  Globe,
  PackageOpen,
  Settings2,
} from "lucide-react";

export interface ClientProfileSection {
  id: string;
  label: string;
  icon: LucideIcon;
  testId: string;
  primary: boolean;
  requiresCrmFlag?: keyof CrmFlagRequirements;
  requiresFeatureFlag?: keyof FeatureFlagRequirements;
  badgeText?: string;
  isControlCenter?: boolean;
}

interface CrmFlagRequirements {
  client360: boolean;
  approvals: boolean;
  clientMessaging: boolean;
}

interface FeatureFlagRequirements {
  assetLibraryV2: boolean;
  clientControlCenterPremium: boolean;
}

export const CONTROL_CENTER_CHILD_IDS = new Set([
  "activity",
  "reports",
  "portal",
  "divisions",
  "notes",
]);

export const ALL_CLIENT_PROFILE_SECTIONS: ClientProfileSection[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, testId: "tab-overview", primary: true },
  { id: "contacts", label: "Contacts", icon: Users, testId: "tab-contacts", primary: true },
  { id: "projects", label: "Projects", icon: FolderKanban, testId: "tab-projects", primary: true },
  { id: "divisions", label: "Divisions", icon: Layers, testId: "tab-divisions", primary: true },
  { id: "activity", label: "Activity", icon: Activity, testId: "tab-activity", primary: true },
  { id: "reports", label: "Reports", icon: BarChart3, testId: "tab-reports", primary: false, requiresCrmFlag: "client360" },
  { id: "notes", label: "Notes", icon: StickyNote, testId: "tab-notes", primary: false },
  { id: "approvals", label: "Approvals", icon: ClipboardCheck, testId: "tab-approvals", primary: false, requiresCrmFlag: "approvals" },
  { id: "messages", label: "Messages", icon: MessageSquare, testId: "tab-messages", primary: false, requiresCrmFlag: "clientMessaging" },
  { id: "portal", label: "Portal Users", icon: Globe, testId: "tab-portal", primary: false },
  { id: "asset-library", label: "Asset Library", icon: PackageOpen, testId: "tab-asset-library", primary: true, requiresFeatureFlag: "assetLibraryV2" },
];

export function getVisibleSections(
  crmFlags: Partial<CrmFlagRequirements>,
  featureFlags: Partial<FeatureFlagRequirements>,
): ClientProfileSection[] {
  return ALL_CLIENT_PROFILE_SECTIONS.filter((section) => {
    if (section.requiresCrmFlag && !crmFlags[section.requiresCrmFlag]) return false;
    if (section.requiresFeatureFlag && !featureFlags[section.requiresFeatureFlag]) return false;
    return true;
  });
}
