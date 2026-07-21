import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

interface ChatThread {
  type: "channel" | "dm";
  id: string;
  name: string;
}

interface ChatDrawerContextValue {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  lastActiveThread: ChatThread | null;
  setLastActiveThread: (thread: ChatThread | null) => void;
}

const ChatDrawerContext = createContext<ChatDrawerContextValue | null>(null);

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastActiveThread, setLastActiveThread] = useState<ChatThread | null>(null);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);
  const value = useMemo<ChatDrawerContextValue>(() => ({
    isOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    lastActiveThread,
    setLastActiveThread,
  }), [isOpen, openDrawer, closeDrawer, toggleDrawer, lastActiveThread]);

  return (
    <ChatDrawerContext.Provider value={value}>
      {children}
    </ChatDrawerContext.Provider>
  );
}

export function useChatDrawer() {
  const context = useContext(ChatDrawerContext);
  if (!context) {
    throw new Error("useChatDrawer must be used within a ChatDrawerProvider");
  }
  return context;
}
