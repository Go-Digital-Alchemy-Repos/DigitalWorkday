/**
 * Comment Thread Component
 * 
 * Provides full comment management for tasks with permission-based actions.
 * 
 * Features:
 * - Add new comments with @mention support
 * - Edit/delete comments (owner-only permission)
 * - Resolve/unresolve comment threads for discussion tracking
 * - Real-time @mention autocomplete from tenant users
 * - File attachments on comments (drag-and-drop + click-to-select)
 * 
 * Permissions Model:
 * - Edit: Only the comment owner (userId matches currentUserId) can edit
 * - Delete: Only the comment owner can delete their comments
 * - Resolve/Unresolve: Any authenticated user can resolve/unresolve threads
 * 
 * @mention System:
 * - Format: @[DisplayName](userId) - parsed client-side for display
 * - User emails are never exposed in mentions (security)
 * - Server validates mentioned users exist in same tenant
 * - Email notifications sent via Mailgun for mentioned users
 * 
 * @see POST /api/tasks/:taskId/comments in server/routes.ts for mention parsing
 */
import { useState, useRef, useCallback } from "react";
import { Pencil, Trash2, Check, X, CheckCircle2, CircleDot, Paperclip, Loader2, RotateCcw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStorageUrl } from "@/lib/storageUrl";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CommentEditor, RichTextRenderer, type CommentEditorRef } from "@/components/richtext";
import { CommentAttachments, type CommentAttachmentMeta } from "@/components/comments/CommentAttachments";
import { CommentDropzone } from "@/components/uploads/CommentDropzone";
import { useAttachmentUploadQueue } from "@/lib/uploads/useAttachmentUploadQueue";
import { useToast } from "@/hooks/use-toast";
import type { Comment, User } from "@shared/schema";

interface CommentWithUser extends Comment {
  user?: User;
  attachments?: CommentAttachmentMeta[];
}

interface CommentThreadProps {
  comments: CommentWithUser[];
  taskId?: string;
  projectId?: string | null;
  entityType?: "task" | "project" | "client";
  entityId?: string;
  currentUserId?: string;
  users?: User[];
  onAdd?: (body: string, attachmentIds?: string[]) => void;
  onUpdate?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
  onResolve?: (id: string) => void;
  onUnresolve?: (id: string) => void;
  title?: string;
  placeholder?: string;
  readOnly?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function renderMentions(body: string): JSX.Element {
  const mentionRegex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="text-primary font-medium">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return <>{parts}</>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommentThread({
  comments,
  taskId,
  projectId,
  entityType = "task",
  entityId,
  currentUserId,
  users,
  onAdd,
  onUpdate,
  onDelete,
  onResolve,
  onUnresolve,
  title = "Comments",
  placeholder = "Write a comment... Type @ to mention someone",
  readOnly = false,
}: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const commentEditorRef = useRef<CommentEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const canAttach = !!projectId && !!taskId;

  const {
    uploads: pendingUploads,
    enqueueFiles,
    removeUpload: removePending,
    retryUpload,
    clearQueue,
    completedIds,
    isUploading,
    hasErrors,
  } = useAttachmentUploadQueue({
    projectId,
    taskId,
    onValidationError: (message) => {
      toast({ title: "File validation", description: message, variant: "destructive" });
    },
  });

  const { data: tenantUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/tenant/users"],
    enabled: !users || users.length === 0,
  });

  const mentionUsers = users && users.length > 0 ? users : tenantUsers;

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || !canAttach) return;
      enqueueFiles(Array.from(files));
    },
    [enqueueFiles, canAttach]
  );

  const handleDropFiles = useCallback(
    (files: File[]) => {
      if (!canAttach) {
        toast({ title: "Cannot attach files", description: "Project context is required for attachments.", variant: "destructive" });
        return;
      }
      enqueueFiles(files);
    },
    [enqueueFiles, canAttach, toast]
  );

  const handleSubmit = useCallback(
    async (content?: string) => {
      const commentBody = content || body;
      if (!commentBody.trim() && pendingUploads.length === 0) return;

      if (isUploading) {
        toast({
          title: "Files still uploading",
          description: "Please wait for uploads to complete before posting.",
          variant: "destructive",
        });
        return;
      }

      if (hasErrors) {
        toast({
          title: "Upload errors",
          description: "Remove or retry failed uploads before posting.",
          variant: "destructive",
        });
        return;
      }

      onAdd?.(commentBody.trim(), completedIds.length > 0 ? completedIds : undefined);
      setBody("");
      clearQueue();
      commentEditorRef.current?.clear();
    },
    [body, pendingUploads, onAdd, toast, isUploading, hasErrors, completedIds, clearQueue]
  );

  const handleEdit = (comment: CommentWithUser) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
  };

  const handleSaveEdit = () => {
    if (editingId && editBody.trim()) {
      onUpdate?.(editingId, editBody.trim());
      setEditingId(null);
      setEditBody("");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditBody("");
  };

  return (
    <div className="space-y-4" data-testid="comment-thread">
      <h4 className="font-medium text-[16px]">{title}</h4>
      {comments.length > 0 && (
        <div className="space-y-4">
          {comments.map((comment) => {
            const isOwner = currentUserId && comment.userId === currentUserId;
            const isEditing = editingId === comment.id;

            return (
              <div
                key={comment.id}
                className={`flex gap-3 ${comment.isResolved ? "opacity-60" : ""}`}
                data-testid={`comment-${comment.id}`}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {comment.user?.avatarUrl && (
                    <AvatarImage src={getStorageUrl(comment.user.avatarUrl)} alt={comment.user.name} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(comment.user?.name || "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {comment.user?.name || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </span>
                    {comment.isResolved && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Resolved
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <CommentEditor
                        value={editBody}
                        onChange={setEditBody}
                        users={mentionUsers}
                        data-testid="textarea-edit-comment"
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleSaveEdit}
                          data-testid="button-save-edit"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          data-testid="button-cancel-edit"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-foreground">
                      <RichTextRenderer value={comment.body} className="text-sm" />
                    </div>
                  )}

                  {!isEditing && comment.attachments && comment.attachments.length > 0 && projectId && taskId && (
                    <CommentAttachments
                      attachments={comment.attachments}
                      projectId={projectId}
                      taskId={taskId}
                    />
                  )}

                  {!isEditing && (
                    <div className="flex gap-1 pt-1">
                      {isOwner && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleEdit(comment)}
                            data-testid={`button-edit-comment-${comment.id}`}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => onDelete?.(comment.id)}
                            data-testid={`button-delete-comment-${comment.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </>
                      )}
                      {comment.isResolved ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => onUnresolve?.(comment.id)}
                          data-testid={`button-unresolve-comment-${comment.id}`}
                        >
                          <CircleDot className="h-3 w-3 mr-1" />
                          Unresolve
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => onResolve?.(comment.id)}
                          data-testid={`button-resolve-comment-${comment.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">
          No comments yet. Be the first to comment.
        </p>
      )}
      {!readOnly && (
        <CommentDropzone onFiles={handleDropFiles} disabled={!canAttach || readOnly}>
          <div className="flex gap-3 pt-2">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">U</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <CommentEditor
                ref={commentEditorRef}
                value={body}
                onChange={setBody}
                onSubmit={handleSubmit}
                placeholder={placeholder}
                users={mentionUsers}
                data-testid="textarea-comment"
                attachButton={
                  canAttach ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-comment-attach"
                    >
                      <Paperclip className="h-3 w-3" />
                    </Button>
                  ) : undefined
                }
              />

              {canAttach && pendingUploads.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Drag files here or use the paperclip to attach
                </p>
              )}

              {pendingUploads.length > 0 && (
                <div className="space-y-1">
                  {pendingUploads.map((upload) => (
                    <div
                      key={upload.id}
                      className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border border-border bg-muted/20"
                      style={{ minHeight: 36 }}
                      data-testid={`pending-upload-${upload.id}`}
                    >
                      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{upload.file.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {formatFileSize(upload.file.size)}
                      </span>
                      {(upload.status === "queued" || upload.status === "uploading" || upload.status === "completing") && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                      )}
                      {upload.status === "complete" && (
                        <Check className="h-3 w-3 text-green-600 shrink-0" />
                      )}
                      {upload.status === "error" && (
                        <>
                          <span className="text-destructive shrink-0 truncate max-w-[140px]" title={upload.error}>
                            {upload.error || "Failed"}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 shrink-0"
                            onClick={() => retryUpload(upload.id)}
                            data-testid={`button-retry-upload-${upload.id}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 shrink-0"
                        onClick={() => removePending(upload.id)}
                        data-testid={`button-remove-pending-${upload.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                data-testid="input-comment-attach"
              />
            </div>
          </div>
        </CommentDropzone>
      )}
    </div>
  );
}
