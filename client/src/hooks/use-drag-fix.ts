import { useEffect } from "react";

export function useDragDropFix() {
  useEffect(() => {
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    const handleDragOver = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "auto";
      }
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        restoreTimer = null;
      }, 500);
    };

    document.addEventListener("dragover", handleDragOver, true);

    return () => {
      document.removeEventListener("dragover", handleDragOver, true);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, []);
}
