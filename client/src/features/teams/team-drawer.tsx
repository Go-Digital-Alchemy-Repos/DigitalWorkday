import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import type { Team, User } from "@shared/schema";

const teamSchema = z.object({
  name: z.string().min(1, "Team name is required"),
  memberIds: z.array(z.string()).default([]),
});

type TeamFormData = z.infer<typeof teamSchema>;

interface TeamDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TeamFormData) => Promise<void>;
  team?: Team | null;
  users?: User[];
  usersLoading?: boolean;
  isLoading?: boolean;
  mode: "create" | "edit";
}

export function TeamDrawer({
  open,
  onOpenChange,
  onSubmit,
  team,
  users = [],
  usersLoading = false,
  isLoading = false,
  mode,
}: TeamDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const form = useForm<TeamFormData>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
      memberIds: [],
    },
  });

  const selectedMemberIds = form.watch("memberIds") ?? [];
  const teamMemberOptions = users.filter((user) => user.role !== "client");
  const filteredMemberOptions = teamMemberOptions.filter((user) => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return true;
    const fullName = getUserDisplayName(user).toLowerCase();
    return fullName.includes(query) || (user.email || "").toLowerCase().includes(query);
  });
  const selectedMembers = teamMemberOptions.filter((user) => selectedMemberIds.includes(user.id));

  useEffect(() => {
    if (open && team && mode === "edit") {
      form.reset({
        name: team.name,
        memberIds: [],
      });
    } else if (open && mode === "create") {
      form.reset({
        name: "",
        memberIds: [],
      });
    }
    setMemberSearch("");
    setHasChanges(false);
  }, [open, team, mode, form]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleSubmit = async (data: TeamFormData) => {
    try {
      await onSubmit(data);
      form.reset();
      setMemberSearch("");
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save team:", error);
    }
  };

  const handleClose = () => {
    form.reset();
    setMemberSearch("");
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const toggleMember = (userId: string) => {
    const current = form.getValues("memberIds") ?? [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];

    form.setValue("memberIds", next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const removeMember = (userId: string) => {
    const current = form.getValues("memberIds") ?? [];
    form.setValue(
      "memberIds",
      current.filter((id) => id !== userId),
      {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      },
    );
  };

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Create Team" : "Edit Team"}
      description={mode === "create" ? "Create a new team to organize users" : "Update team details"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="lg"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Create Team" : "Save Changes"}
          saveDisabled={!form.watch("name")?.trim()}
        />
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Team Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Engineering"
                    {...field}
                    data-testid="input-team-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {mode === "create" && (
            <FormField
              control={form.control}
              name="memberIds"
              render={() => (
                <FormItem>
                  <FormLabel>Team Members</FormLabel>
                  <FormDescription>
                    Optional. Add one or more members now, or add them later from User Manager.
                  </FormDescription>
                  <div className="rounded-lg border bg-background">
                    <div className="relative border-b p-3">
                      <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={memberSearch}
                        onChange={(event) => setMemberSearch(event.target.value)}
                        placeholder="Search members..."
                        className="pl-9"
                        data-testid="input-team-member-search"
                      />
                    </div>
                    <div className="max-h-72 overflow-y-auto p-2">
                      {usersLoading ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Loading available members...
                        </p>
                      ) : teamMemberOptions.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                          No eligible team members available.
                        </p>
                      ) : filteredMemberOptions.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                          No members match your search.
                        </p>
                      ) : (
                        filteredMemberOptions.map((user) => {
                          const displayName = getUserDisplayName(user);
                          const checkboxId = `team-drawer-member-${user.id}`;
                          const checked = selectedMemberIds.includes(user.id);

                          return (
                            <label
                              key={user.id}
                              htmlFor={checkboxId}
                              className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                            >
                              <Checkbox
                                id={checkboxId}
                                checked={checked}
                                onCheckedChange={() => toggleMember(user.id)}
                                data-testid={`checkbox-team-drawer-member-${user.id}`}
                              />
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {getUserInitials(user)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{displayName}</span>
                                {user.email && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {user.email}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    {selectedMembers.length > 0 && (
                      <div className="border-t p-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          {selectedMembers.length} selected
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedMembers.map((user) => (
                            <Badge
                              key={user.id}
                              variant="secondary"
                              className="gap-1 pr-1"
                            >
                              {getUserDisplayName(user)}
                              <button
                                type="button"
                                onClick={() => removeMember(user.id)}
                                className="rounded-full p-0.5 hover:bg-background/80"
                                aria-label={`Remove ${getUserDisplayName(user)}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

        </form>
      </Form>
    </FullScreenDrawer>
  );
}

function getUserDisplayName(user: User) {
  if (user.firstName || user.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }
  return user.name || user.email || "Unknown user";
}

function getUserInitials(user: User) {
  const displayName = getUserDisplayName(user);
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}
