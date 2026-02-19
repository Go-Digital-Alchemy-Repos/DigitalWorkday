import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  History,
  StickyNote,
  Search,
  Loader2,
  Send,
  Save,
  ChevronDown,
  ChevronUp,
  Tag,
  Settings,
  FolderOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatErrorForToast } from "@/lib/parseApiError";
import { formatDistanceToNow, format } from "date-fns";
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";

interface NoteAuthor {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface ProjectNote {
  id: string;
  projectId: string;
  body: string;
  category: string;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  authorUserId: string;
  lastEditedByUserId: string | null;
  author: NoteAuthor;
  versionCount: number;
}

interface NoteVersion {
  id: string;
  noteId: string;
  editorUserId: string;
  body: string;
  category: string;
  versionNumber: number;
  createdAt: string;
  editorFirstName: string | null;
  editorLastName: string | null;
}

interface VersionHistoryResponse {
  currentNote: ProjectNote;
  versions: NoteVersion[];
  totalVersions: number;
}

interface NoteCategory {
  id: string;
  tenantId: string;
  name: string;
  color: string | null;
  isSystem: boolean;
  createdAt: string;
}

interface ProjectNotesTabProps {
  projectId: string;
}

const DEFAULT_CATEGORIES = [
  { value: "general", label: "General", color: null },
  { value: "project", label: "Project", color: "#3b82f6" },
  { value: "feedback", label: "Feedback", color: "#eab308" },
  { value: "meeting", label: "Meeting", color: "#a855f7" },
  { value: "requirement", label: "Requirement", color: "#22c55e" },
];

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  project: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  feedback: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  meeting: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  requirement: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const COLOR_OPTIONS = [
  { value: "default", label: "Default (Gray)" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#22c55e", label: "Green" },
  { value: "#eab308", label: "Yellow" },
  { value: "#a855f7", label: "Purple" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#ec4899", label: "Pink" },
];

function getAuthorDisplayName(author: NoteAuthor): string {
  if (author.firstName && author.lastName) {
    return `${author.firstName} ${author.lastName}`;
  }
  if (author.firstName) return author.firstName;
  if (author.email) return author.email.split("@")[0];
  return "Unknown";
}

function getAuthorInitials(author: NoteAuthor): string {
  if (author.firstName) return author.firstName[0].toUpperCase();
  if (author.email) return author.email[0].toUpperCase();
  return "?";
}

function getCategoryBadgeStyle(category: string, color: string | null): string {
  if (color) {
    return "";
  }
  return CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS.general;
}

function getCategoryInlineStyle(color: string | null): React.CSSProperties {
  if (!color) return {};
  return {
    backgroundColor: `${color}20`,
    color: color,
    borderColor: `${color}40`,
  };
}

function convertBodyToHtml(body: any): string {
  if (typeof body === "string") {
    if (body.startsWith("<") || body.trim() === "") {
      return body;
    }
    if (body.startsWith("{") || body.startsWith("[")) {
      try {
        const parsed = JSON.parse(body);
        return convertBodyToHtml(parsed);
      } catch {
        return `<p>${body}</p>`;
      }
    }
    return `<p>${body}</p>`;
  }
  if (!body) return "";
  if (body.type === "doc" && Array.isArray(body.content)) {
    return body.content.map((node: any) => {
      if (node.type === "paragraph") {
        if (!node.content || node.content.length === 0) {
          return "<p></p>";
        }
        const text = node.content.map((item: any) => {
          if (item.type === "text") {
            let result = item.text || "";
            if (item.marks) {
              item.marks.forEach((mark: any) => {
                if (mark.type === "bold") result = `<strong>${result}</strong>`;
                if (mark.type === "italic") result = `<em>${result}</em>`;
                if (mark.type === "link" && mark.attrs?.href) {
                  result = `<a href="${mark.attrs.href}">${result}</a>`;
                }
              });
            }
            return result;
          }
          return "";
        }).join("");
        return `<p>${text}</p>`;
      }
      if (node.type === "bulletList" && Array.isArray(node.content)) {
        const items = node.content.map((li: any) => {
          const text = li.content?.map((p: any) => 
            p.content?.map((t: any) => t.text || "").join("") || ""
          ).join("") || "";
          return `<li>${text}</li>`;
        }).join("");
        return `<ul>${items}</ul>`;
      }
      if (node.type === "orderedList" && Array.isArray(node.content)) {
        const items = node.content.map((li: any) => {
          const text = li.content?.map((p: any) => 
            p.content?.map((t: any) => t.text || "").join("") || ""
          ).join("") || "";
          return `<li>${text}</li>`;
        }).join("");
        return `<ol>${items}</ol>`;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(body);
}

export function ProjectNotesTab({ projectId }: ProjectNotesTabProps) {
  const { toast } = useToast();
  
  const [drawerMode, setDrawerMode] = useState<"closed" | "create" | "edit" | "history">("closed");
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [historyNote, setHistoryNote] = useState<ProjectNote | null>(null);
  const [deleteNote, setDeleteNote] = useState<ProjectNote | null>(null);
  
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [noteCategoryId, setNoteCategoryId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<"create" | "edit">("create");
  const [editingCategory, setEditingCategory] = useState<NoteCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("");
  const [deleteCategory, setDeleteCategory] = useState<NoteCategory | null>(null);

  const { data: notesData, isLoading: notesLoading } = useQuery<{ ok: boolean; notes: ProjectNote[] }>({
    queryKey: ["/api/projects", projectId, "notes"],
  });

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<{ ok: boolean; categories: NoteCategory[] }>({
    queryKey: ["/api/projects", projectId, "notes", "categories"],
  });

  const { data: versionHistoryData, isLoading: versionHistoryLoading } = useQuery<VersionHistoryResponse>({
    queryKey: ["/api/projects", projectId, "notes", historyNote?.id, "versions"],
    enabled: !!historyNote && drawerMode === "history",
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { body: string; category: string; categoryId?: string | null }) => {
      return apiRequest("POST", `/api/projects/${projectId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes"] });
      closeDrawer();
      toast({ title: "Note created", description: "Your note has been saved." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, body, category, categoryId }: { noteId: string; body: string; category: string; categoryId?: string | null }) => {
      return apiRequest("PUT", `/api/projects/${projectId}/notes/${noteId}`, { body, category, categoryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes"] });
      if (historyNote) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes", historyNote.id, "versions"] });
      }
      closeDrawer();
      toast({ title: "Note updated", description: "Your changes have been saved." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/projects/${projectId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes"] });
      setDeleteNote(null);
      toast({ title: "Note deleted", description: "The note has been removed." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      return apiRequest("POST", `/api/projects/${projectId}/notes/categories`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes", "categories"] });
      closeCategoryDialog();
      toast({ title: "Category created", description: "Your category has been saved." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ categoryId, name, color }: { categoryId: string; name: string; color?: string }) => {
      return apiRequest("PUT", `/api/projects/${projectId}/notes/categories/${categoryId}`, { name, color });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes"] });
      closeCategoryDialog();
      toast({ title: "Category updated", description: "Your changes have been saved." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      return apiRequest("DELETE", `/api/projects/${projectId}/notes/categories/${categoryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes"] });
      setDeleteCategory(null);
      toast({ title: "Category deleted", description: "The category has been removed." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const closeDrawer = () => {
    setDrawerMode("closed");
    setEditingNote(null);
    setHistoryNote(null);
    setNoteBody("");
    setNoteCategory("general");
    setNoteCategoryId(null);
    setExpandedVersions(new Set());
    setShowDiscardConfirm(false);
  };

  const closeCategoryDialog = () => {
    setShowCategoryManager(false);
    setCategoryDialogMode("create");
    setEditingCategory(null);
    setCategoryName("");
    setCategoryColor("default");
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      closeDrawer();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    closeDrawer();
  };

  const openCreateDrawer = () => {
    setNoteBody("");
    setNoteCategory("general");
    setNoteCategoryId(null);
    setDrawerMode("create");
  };

  const openEditDrawer = (note: ProjectNote) => {
    setEditingNote(note);
    setNoteBody(convertBodyToHtml(note.body));
    setNoteCategory(note.category);
    setNoteCategoryId(note.categoryId);
    setDrawerMode("edit");
  };

  const openHistoryDrawer = (note: ProjectNote) => {
    setHistoryNote(note);
    setDrawerMode("history");
  };

  const openCreateCategoryDialog = () => {
    setCategoryDialogMode("create");
    setCategoryName("");
    setCategoryColor("default");
    setEditingCategory(null);
    setShowCategoryManager(true);
  };

  const openEditCategoryDialog = (category: NoteCategory) => {
    setCategoryDialogMode("edit");
    setCategoryName(category.name);
    setCategoryColor(category.color || "default");
    setEditingCategory(category);
    setShowCategoryManager(true);
  };

  const handleSaveNote = () => {
    if (!noteBody.trim() || noteBody === "<p></p>") return;
    
    const customCat = customCategories.find(c => c.name.toLowerCase() === noteCategory.toLowerCase());
    const effectiveCategoryId = customCat ? customCat.id : null;
    
    if (drawerMode === "create") {
      createNoteMutation.mutate({ body: noteBody, category: noteCategory, categoryId: effectiveCategoryId });
    } else if (drawerMode === "edit" && editingNote) {
      updateNoteMutation.mutate({
        noteId: editingNote.id,
        body: noteBody,
        category: noteCategory,
        categoryId: effectiveCategoryId,
      });
    }
  };

  const handleSaveCategory = () => {
    if (!categoryName.trim()) return;
    
    const colorValue = categoryColor === "default" ? undefined : categoryColor || undefined;
    
    if (categoryDialogMode === "create") {
      createCategoryMutation.mutate({ name: categoryName, color: colorValue });
    } else if (editingCategory) {
      updateCategoryMutation.mutate({
        categoryId: editingCategory.id,
        name: categoryName,
        color: colorValue,
      });
    }
  };

  const toggleVersionExpanded = (versionId: string) => {
    setExpandedVersions(prev => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  };

  const notes = notesData?.notes || [];
  const customCategories = categoriesData?.categories || [];
  
  const allCategoryOptions = useMemo(() => {
    const options = [...DEFAULT_CATEGORIES];
    customCategories.forEach(cat => {
      if (!options.find(o => o.value.toLowerCase() === cat.name.toLowerCase())) {
        options.push({ value: cat.name.toLowerCase(), label: cat.name, color: cat.color });
      }
    });
    return options;
  }, [customCategories]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    notes.forEach(note => {
      const cat = note.category.toLowerCase();
      stats[cat] = (stats[cat] || 0) + 1;
    });
    return stats;
  }, [notes]);
  
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const bodyHtml = convertBodyToHtml(note.body);
      const matchesSearch = !searchQuery || 
        bodyHtml.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === "all" || note.category.toLowerCase() === filterCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [notes, searchQuery, filterCategory]);

  const latestNotes = useMemo(() => {
    return [...notes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [notes]);

  const hasUnsavedChanges = useMemo(() => {
    if (drawerMode === "create") {
      return noteBody.trim() !== "" && noteBody !== "<p></p>";
    }
    if (drawerMode === "edit" && editingNote) {
      const originalBody = convertBodyToHtml(editingNote.body);
      return noteBody !== originalBody || noteCategory !== editingNote.category;
    }
    return false;
  }, [drawerMode, noteBody, noteCategory, editingNote]);

  const isLoading = createNoteMutation.isPending || updateNoteMutation.isPending;
  const isCategoryLoading = createCategoryMutation.isPending || updateCategoryMutation.isPending;
  const canSave = noteBody.trim() !== "" && noteBody !== "<p></p>";

  if (notesLoading || categoriesLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-medium">Notes Dashboard</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openCreateCategoryDialog} data-testid="project-button-manage-categories">
            <Tag className="h-4 w-4 mr-2" />
            Add Category
          </Button>
          <Button onClick={openCreateDrawer} data-testid="project-button-create-note">
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          {latestNotes.length > 0 && (
            <Card data-testid="project-section-latest-notes">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Latest Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {latestNotes.map((note) => (
                  <div 
                    key={note.id} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover-elevate cursor-pointer"
                    onClick={() => openEditDrawer(note)}
                    data-testid={`project-latest-note-${note.id}`}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback>{getAuthorInitials(note.author)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {getAuthorDisplayName(note.author)}
                        </span>
                        <Badge 
                          variant="secondary" 
                          className={getCategoryBadgeStyle(note.category, null)}
                          style={getCategoryInlineStyle(customCategories.find(c => c.name.toLowerCase() === note.category.toLowerCase())?.color || null)}
                        >
                          {note.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        <RichTextViewer content={convertBodyToHtml(note.body)} />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {notes.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="project-input-search-notes"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-40" data-testid="project-select-filter-category">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {allCategoryOptions.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {notes.length === 0 ? (
            <Card data-testid="project-empty-state-no-notes">
              <CardContent className="p-8 text-center">
                <StickyNote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">No notes yet</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Keep track of important information about this project.
                </p>
                <Button onClick={openCreateDrawer} data-testid="project-button-create-first-note">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Note
                </Button>
              </CardContent>
            </Card>
          ) : filteredNotes.length === 0 ? (
            <Card data-testid="project-empty-state-no-matching-notes">
              <CardContent className="p-8 text-center">
                <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">No matching notes</h3>
                <p className="text-muted-foreground text-sm">
                  Try adjusting your search or filter criteria.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => (
                <Card key={note.id} className="hover-elevate" data-testid={`project-note-card-${note.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback>{getAuthorInitials(note.author)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {getAuthorDisplayName(note.author)}
                            </span>
                            <Badge 
                              variant="secondary" 
                              className={getCategoryBadgeStyle(note.category, null)}
                              style={getCategoryInlineStyle(customCategories.find(c => c.name.toLowerCase() === note.category.toLowerCase())?.color || null)}
                              data-testid={`project-badge-note-category-${note.id}`}
                            >
                              {note.category}
                            </Badge>
                            {note.versionCount > 0 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs cursor-pointer"
                                onClick={() => openHistoryDrawer(note)}
                                data-testid={`project-note-version-badge-${note.id}`}
                              >
                                <History className="h-3 w-3 mr-1" />
                                {note.versionCount} edit{note.versionCount > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                            {note.updatedAt !== note.createdAt && <span> (edited)</span>}
                          </p>
                          <div className="mt-2 text-sm">
                            <RichTextViewer content={convertBodyToHtml(note.body)} />
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0" data-testid={`project-note-menu-${note.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDrawer(note)} data-testid={`project-note-edit-${note.id}`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {note.versionCount > 0 && (
                            <DropdownMenuItem onClick={() => openHistoryDrawer(note)} data-testid={`project-note-history-${note.id}`}>
                              <History className="h-4 w-4 mr-2" />
                              View History
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setDeleteNote(note)}
                            className="text-destructive"
                            data-testid={`project-note-delete-${note.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card data-testid="project-panel-categories-overview">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Categories
                </span>
                <Button variant="ghost" size="icon" onClick={openCreateCategoryDialog} data-testid="project-button-add-category-sidebar">
                  <Plus className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {DEFAULT_CATEGORIES.map((cat) => {
                const count = categoryStats[cat.value] || 0;
                return (
                  <div 
                    key={cat.value}
                    className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover-elevate ${filterCategory === cat.value ? 'bg-primary/10' : ''}`}
                    onClick={() => setFilterCategory(filterCategory === cat.value ? "all" : cat.value)}
                    data-testid={`project-filter-category-${cat.value}`}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: cat.color || "#6b7280" }}
                      />
                      <span className="text-sm">{cat.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{count}</Badge>
                  </div>
                );
              })}

              {customCategories.length > 0 && (
                <>
                  <div className="border-t my-2" />
                  <p className="text-xs text-muted-foreground font-medium">Custom Categories</p>
                  {customCategories.map((cat) => {
                    const count = categoryStats[cat.name.toLowerCase()] || 0;
                    return (
                      <div 
                        key={cat.id}
                        className={`flex items-center justify-between p-2 rounded-md group ${filterCategory === cat.name.toLowerCase() ? 'bg-primary/10' : ''}`}
                        data-testid={`project-custom-category-${cat.id}`}
                      >
                        <div 
                          className="flex items-center gap-2 flex-1 cursor-pointer"
                          onClick={() => setFilterCategory(filterCategory === cat.name.toLowerCase() ? "all" : cat.name.toLowerCase())}
                        >
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: cat.color || "#6b7280" }}
                          />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-xs">{count}</Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" data-testid={`project-category-menu-${cat.id}`}>
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditCategoryDialog(cat)} data-testid={`project-category-edit-${cat.id}`}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeleteCategory(cat)}
                                className="text-destructive"
                                data-testid={`project-category-delete-${cat.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {customCategories.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No custom categories yet
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="project-panel-notes-stats">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Notes</span>
                <span className="font-medium">{notes.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Categories Used</span>
                <span className="font-medium">{Object.keys(categoryStats).length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Custom Categories</span>
                <span className="font-medium">{customCategories.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <FullScreenDrawer
        open={drawerMode === "create" || drawerMode === "edit"}
        onOpenChange={(open) => {
          if (!open) {
            if (hasUnsavedChanges) {
              setShowDiscardConfirm(true);
            } else {
              closeDrawer();
            }
          }
        }}
        title={drawerMode === "create" ? "Create Note" : "Edit Note"}
        description={drawerMode === "create" 
          ? "Add a note about this project. Notes are visible to all team members."
          : "Make changes to your note. Previous versions will be saved in the history."
        }
        width="2xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={isLoading}
              data-testid="project-button-cancel-note"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNote}
              disabled={!canSave || isLoading}
              data-testid="project-button-save-note"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {drawerMode === "create" ? <Send className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {drawerMode === "create" ? "Save Note" : "Save Changes"}
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={noteCategory} onValueChange={setNoteCategory}>
              <SelectTrigger data-testid="project-select-note-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allCategoryOptions.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note Content</Label>
            <RichTextEditor
              value={noteBody}
              onChange={setNoteBody}
              placeholder="Enter your note..."
              minHeight="300px"
              data-testid="project-editor-note-content"
            />
          </div>
        </div>
      </FullScreenDrawer>

      <FullScreenDrawer
        open={drawerMode === "history"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Note Version History"
        description={historyNote ? `Viewing edit history for this note` : undefined}
        width="2xl"
      >
        {versionHistoryLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : versionHistoryData ? (
          <div className="space-y-6">
            <div className="border rounded-lg p-4 bg-muted/30" data-testid="project-panel-current-version">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Current Version</span>
                <Badge variant="secondary" className={CATEGORY_COLORS[versionHistoryData.currentNote.category] || CATEGORY_COLORS.general} data-testid="project-badge-current-version-category">
                  {versionHistoryData.currentNote.category}
                </Badge>
              </div>
              <div className="text-sm">
                <RichTextViewer content={convertBodyToHtml(versionHistoryData.currentNote.body)} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Last updated {formatDistanceToNow(new Date(versionHistoryData.currentNote.updatedAt), { addSuffix: true })}
              </p>
            </div>

            {versionHistoryData.versions.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Previous Versions ({versionHistoryData.totalVersions})</h4>
                {versionHistoryData.versions.map((version) => (
                  <Card key={version.id} data-testid={`project-version-card-${version.id}`}>
                    <CardContent className="p-4">
                      <button 
                        type="button"
                        className="flex items-center justify-between w-full cursor-pointer text-left"
                        onClick={() => toggleVersionExpanded(version.id)}
                        data-testid={`project-button-toggle-version-${version.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {version.editorFirstName?.[0]?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="text-sm font-medium">
                              Version {version.versionNumber}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              by {version.editorFirstName && version.editorLastName 
                                ? `${version.editorFirstName} ${version.editorLastName}` 
                                : version.editorFirstName || "Unknown"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(version.createdAt), "MMM d, yyyy h:mm a")}
                          </span>
                          {expandedVersions.has(version.id) ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {expandedVersions.has(version.id) && (
                        <div className="mt-3 pt-3 border-t">
                          <Badge variant="outline" className="mb-2" data-testid={`project-badge-version-category-${version.id}`}>{version.category}</Badge>
                          <div className="text-sm">
                            <RichTextViewer content={convertBodyToHtml(version.body)} />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground" data-testid="project-empty-state-no-version-history">
            No version history available
          </div>
        )}
      </FullScreenDrawer>

      <Dialog open={showCategoryManager} onOpenChange={(open) => !open && closeCategoryDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialogMode === "create" ? "Create Category" : "Edit Category"}</DialogTitle>
            <DialogDescription>
              {categoryDialogMode === "create" 
                ? "Add a new category for organizing your notes."
                : "Update this category's name and color."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Category name"
                data-testid="project-input-category-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-color">Color</Label>
              <Select value={categoryColor} onValueChange={setCategoryColor}>
                <SelectTrigger data-testid="project-select-category-color">
                  <SelectValue placeholder="Choose a color" />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full border"
                          style={{ backgroundColor: color.value || "#6b7280" }}
                        />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeCategoryDialog} data-testid="project-button-cancel-category">
              Cancel
            </Button>
            <Button 
              onClick={handleSaveCategory} 
              disabled={!categoryName.trim() || isCategoryLoading}
              data-testid="project-button-save-category"
            >
              {isCategoryLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                categoryDialogMode === "create" ? "Create" : "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteNote} onOpenChange={(open) => !open && setDeleteNote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone and will also remove all version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteNote(null)} data-testid="project-button-cancel-delete-note">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteNote && deleteNoteMutation.mutate(deleteNote.id)}
              disabled={deleteNoteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="project-button-confirm-delete-note"
            >
              {deleteNoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCategory} onOpenChange={(open) => !open && setDeleteCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this category? Notes using this category will be moved to "General".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteCategory(null)} data-testid="project-button-cancel-delete-category">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCategory && deleteCategoryMutation.mutate(deleteCategory.id)}
              disabled={deleteCategoryMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="project-button-confirm-delete-category"
            >
              {deleteCategoryMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)} data-testid="project-button-keep-editing">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard} data-testid="project-button-confirm-discard">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
