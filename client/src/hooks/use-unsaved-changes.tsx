import { useEffect, useRef, useCallback, useState } from "react";
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

export interface UnsavedChangesState {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  markClean: () => void;
  markDirty: () => void;
  confirmIfDirty: (callback: () => void) => void;
  UnsavedChangesDialog: () => JSX.Element;
}

export function useUnsavedChanges(initialDirty = false): UnsavedChangesState {
  const [isDirty, setIsDirty] = useState(initialDirty);
  const [showDialog, setShowDialog] = useState(false);
  const pendingCallbackRef = useRef<(() => void) | null>(null);

  const markClean = useCallback(() => setIsDirty(false), []);
  const markDirty = useCallback(() => setIsDirty(true), []);
  const setDirty = useCallback((dirty: boolean) => setIsDirty(dirty), []);

  const confirmIfDirty = useCallback(
    (callback: () => void) => {
      if (isDirty) {
        pendingCallbackRef.current = callback;
        setShowDialog(true);
      } else {
        callback();
      }
    },
    [isDirty]
  );

  const handleConfirm = useCallback(() => {
    setShowDialog(false);
    setIsDirty(false);
    if (pendingCallbackRef.current) {
      pendingCallbackRef.current();
      pendingCallbackRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    pendingCallbackRef.current = null;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const UnsavedChangesDialog = useCallback(
    () => (
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your
              changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancel}
              data-testid="button-cancel-discard"
            >
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-discard"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [showDialog, handleCancel, handleConfirm]
  );

  return {
    isDirty,
    setDirty,
    markClean,
    markDirty,
    confirmIfDirty,
    UnsavedChangesDialog,
  };
}

export default useUnsavedChanges;
