import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface FormFieldWrapperProps {
  label: string;
  labelIcon?: ReactNode;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
  "data-testid"?: string;
}

export function FormFieldWrapper({
  label,
  labelIcon,
  required = false,
  helpText,
  error,
  children,
  className,
  labelClassName,
  "data-testid": testId,
}: FormFieldWrapperProps) {
  return (
    <div className={cn("space-y-1.5", className)} data-testid={testId}>
      <label
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          error ? "text-destructive" : "text-muted-foreground",
          labelClassName
        )}
      >
        {labelIcon && <span className="flex-shrink-0">{labelIcon}</span>}
        <span>{label}</span>
        {required && <span className="text-destructive">*</span>}
      </label>
      
      {children}
      
      {error ? (
        <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      ) : helpText ? (
        <p className="text-xs text-muted-foreground/70">{helpText}</p>
      ) : null}
    </div>
  );
}
