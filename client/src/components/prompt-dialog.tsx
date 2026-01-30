import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  defaultValue = "",
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [open, defaultValue]);

  const handleConfirm = useCallback(() => {
    onConfirm(value);
    onOpenChange(false);
  }, [value, onConfirm, onOpenChange]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    },
    [handleConfirm]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="prompt-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            {label && <Label htmlFor="prompt-input">{label}</Label>}
            <Input
              ref={inputRef}
              id="prompt-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              data-testid="prompt-dialog-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            data-testid="prompt-dialog-cancel"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            data-testid="prompt-dialog-confirm"
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UsePromptDialogOptions {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface UsePromptDialogReturn {
  prompt: (defaultValue?: string) => Promise<string | null>;
  PromptDialogComponent: () => JSX.Element;
}

export function usePromptDialog(options: UsePromptDialogOptions): UsePromptDialogReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const prompt = useCallback((initialValue: string = ""): Promise<string | null> => {
    setDefaultValue(initialValue);
    setIsOpen(true);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback((value: string) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    resolverRef.current?.(null);
    resolverRef.current = null;
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resolverRef.current?.(null);
      resolverRef.current = null;
    }
  }, []);

  const PromptDialogComponent = useCallback(
    () => (
      <PromptDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title={options.title}
        description={options.description}
        label={options.label}
        placeholder={options.placeholder}
        defaultValue={defaultValue}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
    [isOpen, defaultValue, options, handleConfirm, handleCancel, handleOpenChange]
  );

  return { prompt, PromptDialogComponent };
}
