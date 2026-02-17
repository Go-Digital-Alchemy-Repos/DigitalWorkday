import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Plus, X, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { AvatarGroup } from "@/components/avatar-group";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

interface MultiSelectAssigneesProps {
  taskId: string;
  assignees: Partial<User>[];
  workspaceId?: string;
  disabled?: boolean;
  onAssigneeChange?: () => void;
  apiPrefix?: string;
  invalidateKeys?: string[][];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function MultiSelectAssignees({ 
  taskId, 
  assignees, 
  workspaceId,
  disabled = false,
  onAssigneeChange,
  apiPrefix,
  invalidateKeys,
}: MultiSelectAssigneesProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const prefix = apiPrefix || `/api/tasks/${taskId}`;
  const defaultCacheKeys: string[][] = apiPrefix 
    ? [] 
    : [["/api/tasks", taskId], ["/api/tasks/my"]];
  const keysToInvalidate = invalidateKeys || defaultCacheKeys;

  const { data: tenantUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/tenant/users"],
    enabled: open,
  });

  const invalidateAll = () => {
    for (const key of keysToInvalidate) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    onAssigneeChange?.();
  };

  const addAssigneeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `${prefix}/assignees`, { userId });
    },
    onSuccess: invalidateAll,
  });

  const removeAssigneeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `${prefix}/assignees/${userId}`);
    },
    onSuccess: invalidateAll,
  });

  const assigneeIds = new Set(assignees.map((a) => a.id));
  
  const filteredUsers = tenantUsers.filter((user) => {
    const name = user.name?.toLowerCase() || "";
    const email = user.email?.toLowerCase() || "";
    const firstName = user.firstName?.toLowerCase() || "";
    const lastName = user.lastName?.toLowerCase() || "";
    const searchLower = search.toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower) || 
           firstName.includes(searchLower) || lastName.includes(searchLower);
  });

  const toggleAssignee = (userId: string) => {
    if (assigneeIds.has(userId)) {
      removeAssigneeMutation.mutate(userId);
    } else {
      addAssigneeMutation.mutate(userId);
    }
  };

  const isLoading = addAssigneeMutation.isPending || removeAssigneeMutation.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-1 gap-2"
          disabled={disabled}
          data-testid="button-multi-select-assignees"
        >
          {assignees.length > 0 ? (
            <AvatarGroup users={assignees} max={3} size="sm" />
          ) : (
            <UserCircle className="h-5 w-5 text-muted-foreground" />
          )}
          <Plus className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            data-testid="input-search-assignees"
          />
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {filteredUsers.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No members found
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = assigneeIds.has(user.id);
                
                return (
                  <button
                    key={user.id}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                      "hover-elevate cursor-pointer",
                      isSelected && "bg-primary/5"
                    )}
                    onClick={() => toggleAssignee(user.id)}
                    disabled={isLoading}
                    data-testid={`button-toggle-assignee-${user.id}`}
                  >
                    <Avatar className="h-6 w-6">
                      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || ""} />}
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {getInitials(user.name || "U")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{user.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
        {assignees.length > 0 && (
          <div className="p-2 border-t">
            <div className="text-xs text-muted-foreground mb-2">
              {assignees.length} assigned
            </div>
            <div className="flex flex-wrap gap-1">
              {assignees.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-xs"
                >
                  <span className="truncate max-w-[100px]">{user.name}</span>
                  <button
                    onClick={() => user.id && removeAssigneeMutation.mutate(user.id)}
                    className="hover-elevate rounded"
                    disabled={isLoading}
                    data-testid={`button-remove-assignee-${user.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
