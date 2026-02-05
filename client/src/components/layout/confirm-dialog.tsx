import { ReactNode, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  icon?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  isLoading: externalLoading,
  icon,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading ?? internalLoading;
  
  const handleConfirm = async () => {
    try {
      setInternalLoading(true);
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Confirm action failed:", error);
    } finally {
      setInternalLoading(false);
    }
  };
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2" data-testid="confirm-dialog-title">
            {icon}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription data-testid="confirm-dialog-description">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} data-testid="button-cancel">
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={isLoading}
            data-testid="button-confirm"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<Omit<ConfirmDialogProps, "open" | "onOpenChange"> | null>(null);
  
  const confirm = (options: Omit<ConfirmDialogProps, "open" | "onOpenChange">) => {
    setConfig(options);
    setIsOpen(true);
  };
  
  const ConfirmDialogComponent = config ? (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      {...config}
    />
  ) : null;
  
  return {
    confirm,
    ConfirmDialog: ConfirmDialogComponent,
    isOpen,
    close: () => setIsOpen(false),
  };
}
