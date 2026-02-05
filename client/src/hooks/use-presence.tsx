/**
 * User Presence Hook
 * 
 * Provides real-time user presence status (online/offline) via Socket.IO.
 * Manages presence state, heartbeat pings, and socket subscriptions.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { getSocket, isSocketConnected, onConnectionChange } from '@/lib/realtime/socket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PRESENCE_EVENTS, type PresenceState, type PresenceUpdatePayload, type PresenceBulkUpdatePayload } from '@shared/events';

// Re-export for convenience
export type { PresenceState };

interface PresenceContextType {
  presenceMap: Map<string, PresenceState>;
  isOnline: (userId: string) => boolean;
  getLastSeen: (userId: string) => Date | null;
  getPresence: (userId: string) => PresenceState | null;
}

const PresenceContext = createContext<PresenceContextType | null>(null);

const PING_INTERVAL_MS = 25000; // 25 seconds

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceState>>(new Map());
  const [isConnected, setIsConnected] = useState(() => isSocketConnected());

  // Track socket connection state and refetch presence on reconnect
  useEffect(() => {
    const cleanup = onConnectionChange((connected) => {
      setIsConnected(connected);
      // On reconnect, invalidate presence query to ensure fresh data
      // This supplements the BULK_UPDATE the server sends
      if (connected) {
        queryClient.invalidateQueries({ queryKey: ['/api/v1/presence'] });
      }
    });
    return cleanup;
  }, [queryClient]);

  // Fetch initial presence data
  const { data: initialPresence } = useQuery<PresenceState[]>({
    queryKey: ['/api/v1/presence'],
    enabled: !!user,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Initialize presence map from API data
  useEffect(() => {
    if (initialPresence && initialPresence.length > 0) {
      setPresenceMap(prev => {
        const newMap = new Map(prev);
        initialPresence.forEach(p => {
          newMap.set(p.userId, p);
        });
        return newMap;
      });
    }
  }, [initialPresence]);

  // Handle presence updates from socket
  useEffect(() => {
    if (!isConnected) return;

    const socket = getSocket();

    const handlePresenceUpdate = (payload: PresenceUpdatePayload) => {
      setPresenceMap(prev => {
        const newMap = new Map(prev);
        newMap.set(payload.userId, payload);
        return newMap;
      });
    };

    const handleBulkUpdate = (payload: PresenceBulkUpdatePayload) => {
      setPresenceMap(prev => {
        const newMap = new Map(prev);
        payload.users.forEach(p => {
          newMap.set(p.userId, p);
        });
        return newMap;
      });
    };

    socket.on(PRESENCE_EVENTS.UPDATE, handlePresenceUpdate);
    socket.on(PRESENCE_EVENTS.BULK_UPDATE, handleBulkUpdate);

    return () => {
      socket.off(PRESENCE_EVENTS.UPDATE, handlePresenceUpdate);
      socket.off(PRESENCE_EVENTS.BULK_UPDATE, handleBulkUpdate);
    };
  }, [isConnected]);

  // Send periodic presence pings
  useEffect(() => {
    if (!isConnected) return;

    const socket = getSocket();

    // Send initial ping
    socket.emit(PRESENCE_EVENTS.PING, {});

    // Set up periodic pings
    pingIntervalRef.current = setInterval(() => {
      if (isSocketConnected()) {
        socket.emit(PRESENCE_EVENTS.PING, {});
      }
    }, PING_INTERVAL_MS);

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [isConnected]);

  const isOnline = useCallback((userId: string): boolean => {
    const state = presenceMap.get(userId);
    return state?.online ?? false;
  }, [presenceMap]);

  const getLastSeen = useCallback((userId: string): Date | null => {
    const state = presenceMap.get(userId);
    if (!state?.lastSeenAt) return null;
    return new Date(state.lastSeenAt);
  }, [presenceMap]);

  const getPresence = useCallback((userId: string): PresenceState | null => {
    return presenceMap.get(userId) ?? null;
  }, [presenceMap]);

  const value = useMemo(() => ({
    presenceMap,
    isOnline,
    getLastSeen,
    getPresence,
  }), [presenceMap, isOnline, getLastSeen, getPresence]);

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence(): PresenceContextType {
  const context = useContext(PresenceContext);
  if (!context) {
    // Return a fallback that works even without provider
    return {
      presenceMap: new Map(),
      isOnline: () => false,
      getLastSeen: () => null,
      getPresence: () => null,
    };
  }
  return context;
}

/**
 * Hook to check if a specific user is online
 */
export function useUserPresence(userId: string | undefined): {
  online: boolean;
  lastSeenAt: Date | null;
} {
  const { isOnline, getLastSeen } = usePresence();
  
  if (!userId) {
    return { online: false, lastSeenAt: null };
  }
  
  return {
    online: isOnline(userId),
    lastSeenAt: getLastSeen(userId),
  };
}
