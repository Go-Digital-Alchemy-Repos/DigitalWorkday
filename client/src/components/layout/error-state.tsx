import { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  error?: Error | { message?: string; requestId?: string } | null;
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  icon?: ReactNode;
  showRequestId?: boolean;
}

export function ErrorState({
  error,
  title = "Something went wrong",
  description,
  onRetry,
  className,
  icon,
  showRequestId = true,
}: ErrorStateProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.role === "super_user";
  
  const errorMessage = description || (error as any)?.message || "An unexpected error occurred. Please try again.";
  const requestId = (error as any)?.requestId;
  
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center text-center py-12",
        className
      )}
      data-testid="error-state"
    >
      <div className="mb-4 text-destructive">
        {icon || <AlertCircle className="h-12 w-12" />}
      </div>
      <h3 className="text-lg font-semibold mb-2" data-testid="error-state-title">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4" data-testid="error-state-description">
        {errorMessage}
      </p>
      {showRequestId && requestId && isAdmin && (
        <p className="text-xs text-muted-foreground mb-4 font-mono" data-testid="error-state-request-id">
          Request ID: {requestId}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} data-testid="button-retry">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}
