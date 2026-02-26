import { useRef, useCallback } from "react";

/**
 * useStickyComposerFocus
 *
 * Keeps keyboard focus inside a chat composer textarea after the user sends a
 * message, without stealing focus when the user has intentionally moved away.
 *
 * Usage:
 *   const inputRef = useRef<HTMLTextAreaElement>(null);
 *   const { compositionHandlers, handleSendSuccess } = useStickyComposerFocus(inputRef);
 *
 *   // Spread compositionHandlers on the <textarea>:
 *   <textarea ref={inputRef} {...compositionHandlers} />
 *
 *   // Call handleSendSuccess() right before/after triggering the send:
 *   handleSendSuccess();   // captures hadFocus, schedules rAF refocus
 *   sendMessageMutation.mutate(...);
 *
 * Rules:
 *   - Focus is only restored if the textarea HAD focus at the time of send.
 *   - Uses requestAnimationFrame so the refocus happens after React re-renders
 *     from state clears (e.g. setMessageInput("")).
 *   - Tracks IME composition so Enter during CJK/IME input does NOT send.
 */
export function useStickyComposerFocus(
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>
) {
  const isComposing = useRef(false);

  const onCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    isComposing.current = false;
  }, []);

  /**
   * Call this immediately before triggering the send action.
   * Captures whether the composer had focus, then schedules a rAF to
   * restore focus after the pending re-render from clearing input state.
   */
  const handleSendSuccess = useCallback(() => {
    const hadFocus = document.activeElement === inputRef.current;
    requestAnimationFrame(() => {
      if (hadFocus && inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, [inputRef]);

  /**
   * Drop-in replacement for composing-aware Enter key handler.
   * Returns true if the key event should be treated as a send trigger.
   */
  const isSendKey = useCallback((e: React.KeyboardEvent): boolean => {
    return e.key === "Enter" && !e.shiftKey && !isComposing.current;
  }, []);

  return {
    isComposing,
    compositionHandlers: {
      onCompositionStart,
      onCompositionEnd,
    },
    handleSendSuccess,
    isSendKey,
  };
}
