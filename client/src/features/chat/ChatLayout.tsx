import { useCallback } from "react";
import { useLocation, useSearch } from "wouter";

export type ConversationType = "channel" | "dm";

export interface SelectedConversation {
  type: ConversationType;
  id: string;
}

function parseConversationParam(param: string): SelectedConversation | null {
  const [type, id] = param.split(":");
  if ((type === "channel" || type === "dm") && id) {
    return { type, id };
  }
  return null;
}

export function useChatUrlState() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  
  const getConversationFromUrl = useCallback((): SelectedConversation | null => {
    const params = new URLSearchParams(searchString);
    const conversationParam = params.get("c");
    if (!conversationParam) return null;
    return parseConversationParam(conversationParam);
  }, [searchString]);

  const updateUrl = useCallback((type: ConversationType | null, id: string | null) => {
    if (type && id) {
      setLocation(`/chat?c=${type}:${id}`, { replace: true });
    } else {
      setLocation("/chat", { replace: true });
    }
  }, [setLocation]);

  const selectedConversation = getConversationFromUrl();

  return {
    searchString,
    selectedConversation,
    getConversationFromUrl,
    updateUrl,
  };
}
