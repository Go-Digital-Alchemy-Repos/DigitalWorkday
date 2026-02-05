import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type PresenceStatus = "online" | "offline" | "idle" | "busy" | "dnd";

interface AvatarWithStatusProps {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  status?: PresenceStatus;
  showTooltip?: boolean;
  colorSeed?: string;
  className?: string;
  "data-testid"?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

const textSizeClasses: Record<AvatarSize, string> = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

const statusSizeClasses: Record<AvatarSize, string> = {
  xs: "h-2 w-2 border",
  sm: "h-2.5 w-2.5 border",
  md: "h-3 w-3 border-2",
  lg: "h-3.5 w-3.5 border-2",
  xl: "h-4 w-4 border-2",
};

const statusColors: Record<PresenceStatus, string> = {
  online: "bg-green-500",
  offline: "bg-gray-400",
  idle: "bg-yellow-500",
  busy: "bg-red-500",
  dnd: "bg-red-600",
};

const statusLabels: Record<PresenceStatus, string> = {
  online: "Online",
  offline: "Offline",
  idle: "Away",
  busy: "Busy",
  dnd: "Do Not Disturb",
};

const avatarColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-rose-500",
];

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function AvatarWithStatus({
  src,
  name,
  size = "md",
  status,
  showTooltip = false,
  colorSeed,
  className,
  "data-testid": testId,
}: AvatarWithStatusProps) {
  const initials = getInitials(name);
  const bgColor = getAvatarColor(colorSeed || name);

  const avatarContent = (
    <div className={cn("relative inline-block shrink-0", className)} data-testid={testId}>
      <Avatar className={sizeClasses[size]}>
        {src && <AvatarImage src={src} alt={name} />}
        <AvatarFallback className={cn(textSizeClasses[size], bgColor, "text-white")}>
          {initials}
        </AvatarFallback>
      </Avatar>
      {status && (
        <span 
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-background",
            statusSizeClasses[size],
            statusColors[status]
          )}
          title={statusLabels[status]}
        />
      )}
    </div>
  );

  if (showTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {avatarContent}
        </TooltipTrigger>
        <TooltipContent>
          <p>{name}</p>
          {status && <p className="text-xs text-muted-foreground">{statusLabels[status]}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  return avatarContent;
}

interface AvatarGroupProps {
  users: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    status?: PresenceStatus;
  }>;
  max?: number;
  size?: AvatarSize;
  showTooltip?: boolean;
  className?: string;
  "data-testid"?: string;
}

const groupOverlapClasses: Record<AvatarSize, string> = {
  xs: "-ml-2",
  sm: "-ml-2.5",
  md: "-ml-3",
  lg: "-ml-4",
  xl: "-ml-5",
};

export function AvatarGroup({
  users,
  max = 4,
  size = "sm",
  showTooltip = true,
  className,
  "data-testid": testId,
}: AvatarGroupProps) {
  const visibleUsers = users.slice(0, max);
  const remainingCount = users.length - max;

  return (
    <div 
      className={cn("flex items-center", className)} 
      data-testid={testId}
    >
      {visibleUsers.map((user, index) => (
        <div 
          key={user.id} 
          className={cn(
            "ring-2 ring-background rounded-full",
            index > 0 && groupOverlapClasses[size]
          )}
        >
          <AvatarWithStatus
            src={user.avatarUrl}
            name={user.name}
            size={size}
            status={user.status}
            showTooltip={showTooltip}
            colorSeed={user.id}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={cn(
                "ring-2 ring-background rounded-full",
                groupOverlapClasses[size]
              )}
            >
              <Avatar className={sizeClasses[size]}>
                <AvatarFallback className={cn(textSizeClasses[size], "bg-muted text-muted-foreground")}>
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              {users.slice(max).map(user => (
                <p key={user.id} className="text-sm">{user.name}</p>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

interface UserBadgeProps {
  name: string;
  avatarUrl?: string | null;
  subtitle?: string;
  size?: "sm" | "md";
  status?: PresenceStatus;
  className?: string;
  onClick?: () => void;
  "data-testid"?: string;
}

export function UserBadge({
  name,
  avatarUrl,
  subtitle,
  size = "sm",
  status,
  className,
  onClick,
  "data-testid": testId,
}: UserBadgeProps) {
  const avatarSize = size === "sm" ? "xs" : "sm";
  
  const content = (
    <div 
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1",
        onClick && "cursor-pointer hover-elevate",
        className
      )}
      onClick={onClick}
      data-testid={testId}
    >
      <AvatarWithStatus
        src={avatarUrl}
        name={name}
        size={avatarSize}
        status={status}
        colorSeed={name}
      />
      <div className="flex flex-col pr-1">
        <span className={cn(
          "font-medium leading-tight",
          size === "sm" ? "text-xs" : "text-sm"
        )}>
          {name}
        </span>
        {subtitle && (
          <span className="text-[10px] text-muted-foreground leading-tight">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  return content;
}

interface AssigneeListProps {
  assignees: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  }>;
  max?: number;
  size?: AvatarSize;
  emptyText?: string;
  className?: string;
}

export function AssigneeList({
  assignees,
  max = 3,
  size = "xs",
  emptyText = "Unassigned",
  className,
}: AssigneeListProps) {
  if (!assignees.length) {
    return (
      <span className="text-xs text-muted-foreground">{emptyText}</span>
    );
  }

  if (assignees.length === 1) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <AvatarWithStatus
          src={assignees[0].avatarUrl}
          name={assignees[0].name}
          size={size}
          colorSeed={assignees[0].id}
        />
        <span className="text-xs truncate max-w-[100px]">{assignees[0].name}</span>
      </div>
    );
  }

  return (
    <AvatarGroup
      users={assignees}
      max={max}
      size={size}
      showTooltip
      className={className}
    />
  );
}
