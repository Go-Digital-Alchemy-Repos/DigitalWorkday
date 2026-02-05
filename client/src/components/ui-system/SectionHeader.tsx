import { cn } from "@/lib/utils";
import { SectionTitle, MutedText } from "./Typography";

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function SectionHeader({ 
  title, 
  description, 
  actions, 
  className,
  "data-testid": testId 
}: SectionHeaderProps) {
  return (
    <div 
      className={cn("flex items-center justify-between gap-4", className)}
      data-testid={testId}
    >
      <div className="space-y-0.5">
        <SectionTitle>{title}</SectionTitle>
        {description && <MutedText className="text-xs">{description}</MutedText>}
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
