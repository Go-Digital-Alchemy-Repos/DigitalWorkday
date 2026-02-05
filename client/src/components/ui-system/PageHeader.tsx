import { cn } from "@/lib/utils";
import { PageTitle, MutedText } from "./Typography";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function PageHeader({ 
  title, 
  description, 
  actions, 
  className,
  "data-testid": testId 
}: PageHeaderProps) {
  return (
    <div 
      className={cn("flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between", className)}
      data-testid={testId}
    >
      <div className="space-y-1">
        <PageTitle>{title}</PageTitle>
        {description && <MutedText>{description}</MutedText>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          {actions}
        </div>
      )}
    </div>
  );
}
