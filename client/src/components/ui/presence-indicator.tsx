/**
 * Presence Indicator Component
 * 
 * Displays online/offline status with a Slack-style indicator.
 * - Green filled circle: online
 * - Hollow ring: offline
 * 
 * Optionally shows "Last seen: X" tooltip when offline.
 */

import { cn } from "@/lib/utils";
import { useUserPresence } from "@/hooks/use-presence";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface PresenceIndicatorProps {
  userId: string;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function PresenceIndicator({
  userId,
  size = "md",
  showTooltip = true,
  className,
}: PresenceIndicatorProps) {
  const { online, lastSeenAt } = useUserPresence(userId);

  const indicator = (
    <span
      className={cn(
        "inline-block rounded-full flex-shrink-0",
        sizeClasses[size],
        online
          ? "bg-green-500"
          : "bg-transparent border-2 border-muted-foreground/50",
        className
      )}
      data-testid={`presence-indicator-${userId}`}
    />
  );

  if (!showTooltip) {
    return indicator;
  }

  const tooltipText = online
    ? "Online"
    : lastSeenAt
      ? `Last seen ${formatDistanceToNow(lastSeenAt, { addSuffix: true })}`
      : "Offline";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {indicator}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Presence indicator that overlays on an avatar
 * Positioned at bottom-right corner
 */
interface AvatarPresenceIndicatorProps extends PresenceIndicatorProps {
  avatarSize?: number;
}

export function AvatarPresenceIndicator({
  userId,
  size = "sm",
  showTooltip = true,
  avatarSize = 32,
  className,
}: AvatarPresenceIndicatorProps) {
  const { online, lastSeenAt } = useUserPresence(userId);

  // Calculate position based on avatar size
  const offsetClasses = avatarSize <= 24 
    ? "-bottom-0.5 -right-0.5" 
    : avatarSize <= 32 
      ? "-bottom-0.5 -right-0.5"
      : "-bottom-1 -right-1";

  const indicator = (
    <span
      className={cn(
        "absolute inline-block rounded-full border-2 border-background flex-shrink-0",
        sizeClasses[size],
        offsetClasses,
        online
          ? "bg-green-500"
          : "bg-muted-foreground/30",
        className
      )}
      data-testid={`avatar-presence-${userId}`}
    />
  );

  if (!showTooltip) {
    return indicator;
  }

  const tooltipText = online
    ? "Online"
    : lastSeenAt
      ? `Last seen ${formatDistanceToNow(lastSeenAt, { addSuffix: true })}`
      : "Offline";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {indicator}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
