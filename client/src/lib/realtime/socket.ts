import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents, ConnectionConnectedPayload } from "@shared/events";
import { CONNECTION_EVENTS } from "@shared/events";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const DEBUG_SOCKET =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_SOCKET === "true";

let socket: TypedSocket | null = null;
let isConnected = false;
let lastServerTime: string | null = null;
let lastRequestId: string | null = null;

// Track joined rooms for reconnect handling
const joinedChatRooms: Set<string> = new Set();

// Callbacks for connection state changes
type ConnectionCallback = (connected: boolean) => void;
const connectionCallbacks: Set<ConnectionCallback> = new Set();

// Callbacks for connected ack
type ConnectedAckCallback = (payload: ConnectionConnectedPayload) => void;
const connectedAckCallbacks: Set<ConnectedAckCallback> = new Set();

function debugSocketLog(message: string, ...args: unknown[]): void {
  if (DEBUG_SOCKET) {
    console.log(`[Socket.IO] ${message}`, ...args);
  }
}

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying to reconnect
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
      timeout: 20000,
    });

    socket.on("connect", () => {
      debugSocketLog("Connected:", socket?.id);
      isConnected = true;
      notifyConnectionChange(true);
      
      // Rejoin all chat rooms on reconnect
      rejoinChatRooms();
    });

    socket.on("disconnect", (reason) => {
      debugSocketLog("Disconnected:", reason);
      isConnected = false;
      notifyConnectionChange(false);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket.IO] Connection error:", error.message);
      isConnected = false;
      notifyConnectionChange(false);
    });

    // Heartbeat/ping handling - socket.io handles this automatically
    // but we can add explicit pong handling if needed
    socket.io.on("ping", () => {
      debugSocketLog("Ping received");
    });

    // Handle server connected ack with serverTime and requestId
    socket.on(CONNECTION_EVENTS.CONNECTED, (payload: ConnectionConnectedPayload) => {
      debugSocketLog("Server ack received:", payload.requestId);
      lastServerTime = payload.serverTime;
      lastRequestId = payload.requestId;
      // Notify any listeners about the connected ack
      connectedAckCallbacks.forEach(cb => cb(payload));
    });

    // Development-only guard against duplicate event handlers
    if (import.meta.env.DEV) {
      const registeredHandlers = new Map<string, Set<Function>>();
      const originalOn = socket.on.bind(socket) as (event: string, handler: (...args: any[]) => void) => TypedSocket;
      
      socket.on = ((event: string, handler: (...args: any[]) => void) => {
        if (!registeredHandlers.has(event)) {
          registeredHandlers.set(event, new Set());
        }
        const handlers = registeredHandlers.get(event)!;
        if (handlers.has(handler)) {
          console.warn(`[Socket.IO] Duplicate handler registered for event: ${event}`);
        }
        handlers.add(handler);
        return originalOn(event, handler);
      }) as any;
    }
  }
  return socket;
}

function notifyConnectionChange(connected: boolean) {
  connectionCallbacks.forEach(cb => cb(connected));
}

export function onConnectionChange(callback: ConnectionCallback): () => void {
  connectionCallbacks.add(callback);
  // Return unsubscribe function
  return () => connectionCallbacks.delete(callback);
}

export function isSocketConnected(): boolean {
  return isConnected && socket?.connected === true;
}

// Chat room management with reconnect support
export function joinChatRoom(targetType: 'channel' | 'dm', targetId: string): void {
  const s = getSocket();
  const roomKey = `${targetType}:${targetId}`;
  
  // Prevent duplicate joins
  if (joinedChatRooms.has(roomKey)) {
    debugSocketLog("Already in room:", roomKey);
    return;
  }
  
  s.emit("chat:join" as any, { targetType, targetId });
  joinedChatRooms.add(roomKey);
  debugSocketLog("Joining chat room:", roomKey);
}

export function leaveChatRoom(targetType: 'channel' | 'dm', targetId: string): void {
  const s = getSocket();
  const roomKey = `${targetType}:${targetId}`;
  
  if (!joinedChatRooms.has(roomKey)) {
    debugSocketLog("Not in room:", roomKey);
    return;
  }
  
  s.emit("chat:leave" as any, { targetType, targetId });
  joinedChatRooms.delete(roomKey);
  debugSocketLog("Leaving chat room:", roomKey);
}

function rejoinChatRooms(): void {
  if (joinedChatRooms.size === 0) return;
  
  debugSocketLog("Rejoining chat rooms after reconnect:", joinedChatRooms.size);
  const s = getSocket();
  
  joinedChatRooms.forEach(roomKey => {
    const [targetType, targetId] = roomKey.split(':') as ['channel' | 'dm', string];
    s.emit("chat:join" as any, { targetType, targetId });
    debugSocketLog("Rejoined chat room:", roomKey);
  });
}

export function clearChatRooms(): void {
  joinedChatRooms.clear();
}

export function joinProjectRoom(projectId: string): void {
  const s = getSocket();
  s.emit("room:join:project", { projectId });
  debugSocketLog("Joining project room:", projectId);
}

export function leaveProjectRoom(projectId: string): void {
  const s = getSocket();
  s.emit("room:leave:project", { projectId });
  debugSocketLog("Leaving project room:", projectId);
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
    joinedChatRooms.clear();
    lastServerTime = null;
    lastRequestId = null;
  }
}

// Get the last server time from connected ack
export function getLastServerTime(): string | null {
  return lastServerTime;
}

// Get the last request ID from connected ack
export function getLastRequestId(): string | null {
  return lastRequestId;
}

// Subscribe to connected ack events
export function onConnectedAck(callback: ConnectedAckCallback): () => void {
  connectedAckCallbacks.add(callback);
  return () => connectedAckCallbacks.delete(callback);
}
