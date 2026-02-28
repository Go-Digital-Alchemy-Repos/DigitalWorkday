import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/richtext";
import { PrioritySelector, type PriorityLevel } from "@/components/forms/priority-selector";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  CalendarIcon,
  Loader2,
  Users,
  Clock,
  Tag,
  Layers,
  Paperclip,
  Plus,
  Upload,
  FileText,
  Image,
  File,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Section, Tag as TagType } from "@shared/schema";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  sectionId: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo"),
  dueDate: z.date().optional().nullable(),
  assigneeIds: z.array(z.string()).default([]),
  estimateMinutes: z.number().min(0).optional().nullable(),
});

type CreateTaskFormData = z.infer<typeof createTaskSchema>;

interface TenantUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface QueuedFile {
  id: string;
  file: File;
  name: string;
}

interface TaskCreateDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    title: string;
    description?: string;
    sectionId?: string;
    priority: "low" | "medium" | "high" | "urgent";
    status: "todo" | "in_progress" | "blocked" | "done";
    dueDate?: Date | null;
    assigneeIds?: string[];
    estimateMinutes?: number | null;
    tagIds?: string[];
    subtaskTitles?: string[];
    queuedFiles?: File[];
  }) => Promise<void>;
  sections?: Section[];
  defaultSectionId?: string;
  tenantUsers?: TenantUser[];
  isLoading?: boolean;
  projectId?: string;
  workspaceId?: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskCreateDrawer({
  open,
  onOpenChange,
  onSubmit,
  sections = [],
  defaultSectionId,
  tenantUsers = [],
  isLoading = false,
  projectId,
  workspaceId,
}: TaskCreateDrawerProps) {
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      sectionId: defaultSectionId || "",
      priority: "medium",
      status: "todo",
      dueDate: null,
      assigneeIds: [],
      estimateMinutes: null,
    },
  });

  const { data: workspaceTags = [] } = useQuery<TagType[]>({
    queryKey: ["/api/workspaces", workspaceId, "tags"],
    enabled: !!workspaceId && open,
  });

  const createTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/tags`, { name, color });
      return res.json() as Promise<TagType>;
    },
    onSuccess: (newTag: TagType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "tags"] });
      setSelectedTagIds(prev => [...prev, newTag.id]);
      setIsCreatingTag(false);
      setNewTagName("");
      setNewTagColor("#3b82f6");
      toast({ title: "Tag created and added" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tag", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (open && defaultSectionId) {
      form.setValue("sectionId", defaultSectionId);
    }
  }, [open, defaultSectionId, form]);

  useEffect(() => {
    if (!open) {
      form.reset();
      setSelectedAssignees([]);
      setSelectedTagIds([]);
      setSubtaskTitles([]);
      setNewSubtaskTitle("");
      setQueuedFiles([]);
      setHasChanges(false);
      setTagPopoverOpen(false);
      setIsCreatingTag(false);
      setNewTagName("");
      setNewTagColor("#3b82f6");
    }
  }, [open, form]);

  useEffect(() => {
    const subscription = form.watch(() => {
      const values = form.getValues();
      const initialSectionId = defaultSectionId || "";
      const hasAnyChanges = 
        values.title !== "" ||
        (values.description && values.description !== "") ||
        values.priority !== "medium" ||
        values.status !== "todo" ||
        values.dueDate !== null ||
        values.sectionId !== initialSectionId ||
        selectedAssignees.length > 0 ||
        selectedTagIds.length > 0 ||
        subtaskTitles.length > 0 ||
        queuedFiles.length > 0 ||
        (values.estimateMinutes !== null && values.estimateMinutes !== undefined);
      setHasChanges(!!hasAnyChanges);
    });
    return () => subscription.unsubscribe();
  }, [form, defaultSectionId, selectedAssignees, selectedTagIds, subtaskTitles, queuedFiles]);

  const handleSubmit = async (data: CreateTaskFormData) => {
    try {
      await onSubmit({
        ...data,
        assigneeIds: selectedAssignees,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        subtaskTitles: subtaskTitles.length > 0 ? subtaskTitles : undefined,
        queuedFiles: queuedFiles.length > 0 ? queuedFiles.map(f => f.file) : undefined,
      });
      form.reset();
      setSelectedAssignees([]);
      setSelectedTagIds([]);
      setSubtaskTitles([]);
      setNewSubtaskTitle("");
      setQueuedFiles([]);
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  const handleClose = () => {
    form.reset();
    setSelectedAssignees([]);
    setSelectedTagIds([]);
    setSubtaskTitles([]);
    setNewSubtaskTitle("");
    setQueuedFiles([]);
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const addAssignee = (userId: string) => {
    if (!selectedAssignees.includes(userId)) {
      setSelectedAssignees([...selectedAssignees, userId]);
    }
  };

  const removeAssignee = (userId: string) => {
    setSelectedAssignees(selectedAssignees.filter(id => id !== userId));
  };

  const getDisplayName = (user: TenantUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email;
  };

  const getInitials = (user: TenantUser) => {
    if (user.firstName) return user.firstName[0].toUpperCase();
    return user.email[0].toUpperCase();
  };

  const availableAssignees = tenantUsers.filter(u => !selectedAssignees.includes(u.id));
  const selectedTagSet = new Set(selectedTagIds);
  const availableTags = workspaceTags.filter(t => !selectedTagSet.has(t.id));

  const addSubtask = useCallback(() => {
    const title = newSubtaskTitle.trim();
    if (title) {
      setSubtaskTitles(prev => [...prev, title]);
      setNewSubtaskTitle("");
    }
  }, [newSubtaskTitle]);

  const removeSubtask = useCallback((index: number) => {
    setSubtaskTitles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: QueuedFile[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
    }));
    setQueuedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const removeQueuedFile = useCallback((id: string) => {
    setQueuedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleCreateTag = () => {
    if (!newTagName.trim() || !workspaceId) return;
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  };

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Create Task"
      description="Add a new task to your project"
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel="Create Task"
        />
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter task title..."
                    {...field}
                    data-testid="input-task-title"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <RichTextEditor
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Add a detailed description..."
                    className="min-h-[120px]"
                    data-testid="textarea-task-description"
                  />
                </FormControl>
                <FormDescription>
                  Provide context and details for this task
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.length > 0 && (
              <FormField
                control={form.control}
                name="sectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-section">
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <FormControl>
                    <PrioritySelector
                      value={field.value as PriorityLevel}
                      onChange={field.onChange}
                      data-testid="select-priority"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-due-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : "Pick a date"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value || undefined}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimateMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Estimate (minutes)
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        field.onChange(val ? parseInt(val, 10) : null);
                      }}
                      data-testid="input-estimate-minutes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3">
            <FormLabel className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assignees
            </FormLabel>
            
            {selectedAssignees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedAssignees.map(userId => {
                  const user = tenantUsers.find(u => u.id === userId);
                  if (!user) return null;
                  return (
                    <Badge 
                      key={userId} 
                      variant="secondary"
                      className="pl-1 pr-1 gap-1"
                      data-testid={`badge-assignee-${userId}`}
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                      </Avatar>
                      <span className="mx-1">{getDisplayName(user)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0"
                        onClick={() => removeAssignee(userId)}
                        data-testid={`button-remove-assignee-${userId}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {tenantUsers.length > 0 && (
              <Select 
                value="" 
                onValueChange={(value) => {
                  if (value) addAssignee(value);
                }}
              >
                <SelectTrigger data-testid="select-add-assignee">
                  <SelectValue placeholder={selectedAssignees.length > 0 ? "Add another assignee..." : "Add assignee..."} />
                </SelectTrigger>
                <SelectContent>
                  {availableAssignees.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      All team members assigned
                    </div>
                  ) : (
                    availableAssignees.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                          </Avatar>
                          {getDisplayName(user)}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            {tenantUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No team members available. Assignees can be added after creating the task.
              </p>
            )}
          </div>

          <Separator />

          {projectId && (
            <div 
              className="p-3 sm:p-4 bg-[hsl(var(--section-attachments))] border border-[hsl(var(--section-attachments-border))]"
              style={{ borderRadius: "10px" }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-medium text-foreground text-[16px]">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-add-attachment"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Add File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-file-upload"
                  />
                </div>

                {queuedFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No files attached. Files will be uploaded when the task is created.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {queuedFiles.map((qf) => {
                      const FileIcon = getFileIcon(qf.file.type);
                      return (
                        <div
                          key={qf.id}
                          className="flex items-center justify-between p-2 rounded-md border bg-muted/30"
                          data-testid={`queued-file-${qf.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="text-sm truncate">{qf.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatFileSize(qf.file.size)}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => removeQueuedFile(qf.id)}
                            data-testid={`button-remove-file-${qf.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div 
            className="p-3 sm:p-4 bg-[hsl(var(--section-subtasks))] border border-[hsl(var(--section-subtasks-border))]"
            style={{ borderRadius: "10px" }}
          >
            <div className="space-y-3">
              <label className="flex items-center gap-2 font-medium text-foreground text-[16px]">
                <Layers className="h-3.5 w-3.5" />
                Subtasks
              </label>

              {subtaskTitles.length > 0 && (
                <div className="space-y-1.5">
                  {subtaskTitles.map((title, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                      data-testid={`subtask-item-${index}`}
                    >
                      <div className="h-4 w-4 rounded border border-muted-foreground/40 shrink-0" />
                      <span className="text-sm flex-1 truncate">{title}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeSubtask(index)}
                        data-testid={`button-remove-subtask-${index}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Add a subtask..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                  data-testid="input-new-subtask"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={addSubtask}
                  disabled={!newSubtaskTitle.trim()}
                  data-testid="button-add-subtask"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>

              {subtaskTitles.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Subtasks will be created after the task is saved.
                </p>
              )}
            </div>
          </div>

          {workspaceId && (
            <div 
              className="p-3 sm:p-4 bg-[hsl(var(--section-tags))] border border-[hsl(var(--section-tags-border))]"
              style={{ borderRadius: "10px" }}
            >
              <div className="space-y-2">
                <label className="flex items-center gap-2 font-medium text-foreground text-[16px]">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                  {selectedTagIds.map((tagId) => {
                    const tag = workspaceTags.find(t => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <Badge
                        key={tag.id}
                        variant="secondary"
                        className="gap-1 pr-1"
                        style={{ backgroundColor: tag.color ? `${tag.color}20` : undefined, borderColor: tag.color || undefined }}
                        data-testid={`create-task-tag-${tag.id}`}
                      >
                        <span style={{ color: tag.color || undefined }}>{tag.name}</span>
                        <button
                          type="button"
                          className="ml-1 h-3 w-3 rounded-full hover:bg-destructive/20 flex items-center justify-center"
                          onClick={() => setSelectedTagIds(prev => prev.filter(id => id !== tag.id))}
                          data-testid={`button-remove-create-tag-${tag.id}`}
                        >
                          <X className="h-2 w-2" />
                        </button>
                      </Badge>
                    );
                  })}
                  {selectedTagIds.length === 0 && (
                    <span className="text-sm text-muted-foreground">No tags</span>
                  )}

                  <Popover open={tagPopoverOpen} onOpenChange={(open) => {
                    setTagPopoverOpen(open);
                    if (!open) {
                      setIsCreatingTag(false);
                      setNewTagName("");
                    }
                  }}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-muted ml-auto" data-testid="button-add-tag">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      {isCreatingTag ? (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">Create new tag</div>
                          <Input
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder="Tag name..."
                            className="h-8 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCreateTag();
                              if (e.key === "Escape") {
                                setIsCreatingTag(false);
                                setNewTagName("");
                              }
                            }}
                            data-testid="input-new-tag-name"
                          />
                          <div className="flex items-center gap-2">
                            <ColorPicker
                              value={newTagColor}
                              onChange={setNewTagColor}
                              data-testid="input-new-tag-color"
                            />
                            <span className="text-xs text-muted-foreground">Pick color</span>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className="flex-1"
                              onClick={handleCreateTag}
                              disabled={!newTagName.trim() || createTagMutation.isPending}
                              data-testid="button-create-tag-submit"
                            >
                              {createTagMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Create"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setIsCreatingTag(false);
                                setNewTagName("");
                              }}
                              data-testid="button-cancel-create-tag"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <ScrollArea className="max-h-48">
                            <div className="space-y-0.5">
                              {availableTags.map((tag) => (
                                <button
                                  key={tag.id}
                                  type="button"
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted"
                                  onClick={() => {
                                    setSelectedTagIds(prev => [...prev, tag.id]);
                                    setTagPopoverOpen(false);
                                  }}
                                  data-testid={`button-select-tag-${tag.id}`}
                                >
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: tag.color || "#888" }}
                                  />
                                  <span className="text-sm truncate">{tag.name}</span>
                                </button>
                              ))}
                              {availableTags.length === 0 && (
                                <div className="px-2 py-2 text-xs text-muted-foreground">
                                  {workspaceTags.length === 0 ? "No tags in workspace" : "All tags added"}
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
                            onClick={() => setIsCreatingTag(true)}
                            data-testid="button-create-new-tag"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Create new tag
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}
        </form>
      </Form>
    </FullScreenDrawer>
  );
}
