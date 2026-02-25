import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UsersRound } from "lucide-react";
import { TeamTab } from "@/components/settings/team-tab";
import { PageSkeleton } from "@/components/skeletons/page-skeleton";

export default function UserManagerPage() {
  const { user, isLoading } = useAuth();

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";
  const isEmployee = user?.role === "employee";
  const isTenantMember = isAdmin || isEmployee || isSuperUser;

  if (isLoading) {
    return <PageSkeleton variant="compact" />;
  }

  if (!isTenantMember) {
    return <Redirect to="/" />;
  }

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-6xl p-3 sm:p-4 lg:p-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6">
          <UsersRound className="h-7 w-7 md:h-8 md:w-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{isAdmin || isSuperUser ? "User Manager" : "Team Manager"}</h1>
            <p className="text-muted-foreground text-sm">
              {isAdmin || isSuperUser 
                ? "Manage your organization's users and teams" 
                : "Manage your organization's teams"
              }
            </p>
          </div>
        </div>

        <TeamTab isAdmin={isAdmin || isSuperUser} />
      </div>
    </ScrollArea>
  );
}
