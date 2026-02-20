import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
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
  CheckSquare,
  Plus,
  Upload,
  Search,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import type { ClientProfileSection } from "./clientProfileSections";

interface ClientSearchResult {
  projects: Array<{ id: string; name: string; type: string; status: string }>;
  tasks: Array<{ id: string; name: string; type: string; projectId: string; status: string }>;
}

export interface ClientCommandPaletteProps {
  clientId: string;
  clientName: string;
  visibleSections: ClientProfileSection[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  onNewProject?: () => void;
  onUploadAsset?: () => void;
}

const SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  contacts: Users,
  projects: FolderKanban,
  divisions: Layers,
  activity: Activity,
  notes: StickyNote,
  documents: FileText,
  reports: BarChart3,
  approvals: ClipboardCheck,
  messages: MessageSquare,
  portal: Globe,
  "asset-library": PackageOpen,
};

export function useClientCommandPaletteState() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setOpen((o) => !o);
      }
    };

    document.addEventListener("keydown", down, true);
    return () => document.removeEventListener("keydown", down, true);
  }, []);

  return { open, setOpen };
}

export function ClientCommandPalette({
  clientId,
  clientName,
  visibleSections,
  activeSection,
  onSectionChange,
  onNewProject,
  onUploadAsset,
  open,
  onOpenChange,
}: ClientCommandPaletteProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const debouncedSearch = useDebounce(search, 250);

  const { data: searchResults } = useQuery<ClientSearchResult>({
    queryKey: ["/api/clients", clientId, "search", { q: debouncedSearch }],
    enabled: open && debouncedSearch.length >= 2,
  });

  const handleSelect = useCallback((callback: () => void) => {
    onOpenChange(false);
    setSearch("");
    callback();
  }, [onOpenChange]);

  const navigateTo = useCallback((path: string) => {
    handleSelect(() => setLocation(path));
  }, [handleSelect, setLocation]);

  const filteredSections = useMemo(() => {
    if (!search) return visibleSections;
    const q = search.toLowerCase();
    return visibleSections.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [visibleSections, search]);

  const showSections = filteredSections.length > 0;
  const showSearch = debouncedSearch.length >= 2;
  const hasProjects = searchResults?.projects && searchResults.projects.length > 0;
  const hasTasks = searchResults?.tasks && searchResults.tasks.length > 0;
  const showQuickActions = !search;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={`Search in ${clientName}...`}
        value={search}
        onValueChange={setSearch}
        data-testid="input-client-command-search"
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {showSections && (
          <CommandGroup heading="Sections">
            {filteredSections.map((section) => {
              const Icon = SECTION_ICONS[section.id] || LayoutDashboard;
              const isActive = activeSection === section.id;
              return (
                <CommandItem
                  key={section.id}
                  value={`section-${section.id}`}
                  onSelect={() => handleSelect(() => onSectionChange(section.id))}
                  data-testid={`client-cmd-section-${section.id}`}
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{section.label}</span>
                  {section.badgeText && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                      {section.badgeText}
                    </Badge>
                  )}
                  {isActive && (
                    <span className="ml-auto text-xs text-muted-foreground">Current</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {showQuickActions && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              {onNewProject && (
                <CommandItem
                  value="action-new-project"
                  onSelect={() => handleSelect(() => onNewProject())}
                  data-testid="client-cmd-new-project"
                >
                  <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>New Project</span>
                </CommandItem>
              )}
              {onUploadAsset && (
                <CommandItem
                  value="action-upload-asset"
                  onSelect={() => handleSelect(() => onUploadAsset())}
                  data-testid="client-cmd-upload-asset"
                >
                  <Upload className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Upload Asset</span>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}

        {showSearch && hasProjects && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {searchResults!.projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`project-${project.id}`}
                  onSelect={() => navigateTo(`/projects/${project.id}`)}
                  data-testid={`client-cmd-project-${project.id}`}
                >
                  <FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{project.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize">
                    {project.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {showSearch && hasTasks && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {searchResults!.tasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={`task-${task.id}`}
                  onSelect={() => navigateTo(`/projects/${task.projectId}?task=${task.id}`)}
                  data-testid={`client-cmd-task-${task.id}`}
                >
                  <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{task.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize">
                    {task.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {showSearch && !hasProjects && !hasTasks && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No projects or tasks matching "{debouncedSearch}"
          </div>
        )}
      </CommandList>

      <div className="border-t px-3 py-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border px-1 font-mono text-[10px] font-medium">↵</kbd>
          open
        </span>
        <span className="flex items-center gap-1">
          <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border px-1 font-mono text-[10px] font-medium">↑↓</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border px-1 font-mono text-[10px] font-medium">Esc</kbd>
          close
        </span>
      </div>
    </CommandDialog>
  );
}

export function ClientCommandPaletteMobileTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="md:hidden fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
      aria-label="Open command palette"
      data-testid="button-client-command-trigger"
    >
      <Search className="h-5 w-5" />
    </button>
  );
}
