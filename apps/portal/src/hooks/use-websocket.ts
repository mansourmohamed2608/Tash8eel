import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useSession } from "next-auth/react";

export interface WebSocketPayload<T = any> {
  event: string;
  data: T;
  timestamp: string;
  correlationId?: string;
}

export enum RealTimeEvent {
  // Order events
  ORDER_CREATED = "order:created",
  ORDER_UPDATED = "order:updated",
  ORDER_STATUS_CHANGED = "order:status_changed",
  ORDER_CANCELLED = "order:cancelled",

  // Delivery events
  DELIVERY_STATUS_UPDATED = "delivery:status_updated",
  DELIVERY_LOCATION_UPDATED = "delivery:location_updated",
  DELIVERY_COMPLETED = "delivery:completed",

  // Chat/Conversation events
  MESSAGE_RECEIVED = "message:received",
  MESSAGE_SENT = "message:sent",
  CONVERSATION_STARTED = "conversation:started",
  CONVERSATION_CLOSED = "conversation:closed",

  // Notification events
  NOTIFICATION = "notification",
  ALERT = "alert",

  // Dashboard events
  STATS_UPDATED = "stats:updated",
  REVENUE_UPDATED = "revenue:updated",

  // Inventory events
  STOCK_LOW = "stock:low",
  STOCK_OUT = "stock:out",
  STOCK_UPDATED = "stock:updated",
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
  subscribeToEvents?: RealTimeEvent[];
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  subscribe: (events: RealTimeEvent[]) => void;
  on: <T>(
    event: RealTimeEvent,
    callback: (data: WebSocketPayload<T>) => void,
  ) => () => void;
  lastMessage: WebSocketPayload | null;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
const WS_ENABLED = process.env.NEXT_PUBLIC_WS_ENABLED !== "false" && !!WS_URL;

export function useWebSocket(
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const { data: session } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const connectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketPayload | null>(null);

  // Store options in refs to avoid infinite loops
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const { autoConnect = true, subscribeToEvents = [] } = options;

  const merchantId = session?.user?.merchantId;
  const token = session?.accessToken;

  // Store stable values in refs
  const merchantIdRef = useRef(merchantId);
  const tokenRef = useRef(token);
  const subscribeToEventsRef = useRef(subscribeToEvents);

  merchantIdRef.current = merchantId;
  tokenRef.current = token;
  subscribeToEventsRef.current = subscribeToEvents;

  const connect = useCallback(() => {
    if (!WS_ENABLED) {
      return;
    }
    // Prevent multiple simultaneous connection attempts
    if (
      socketRef.current?.connected ||
      connectingRef.current ||
      !merchantIdRef.current ||
      !tokenRef.current
    ) {
      return;
    }

    connectingRef.current = true;
    setIsConnecting(true);

    const socket = io(`${WS_URL}/ws`, {
      transports: ["websocket", "polling"],
      auth: {
        token: tokenRef.current,
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    socket.on("connect", () => {
      console.log("[WebSocket] Connected");
      connectingRef.current = false;
      setIsConnecting(false);

      // Authenticate with merchant ID
      socket.emit(
        "authenticate",
        { token: tokenRef.current, merchantId: merchantIdRef.current },
        (response: any) => {
          if (response?.success) {
            setIsConnected(true);
            optionsRef.current.onConnect?.();

            // Subscribe to events if specified
            const events = subscribeToEventsRef.current;
            if (events && events.length > 0) {
              socket.emit("subscribe", { events });
            }
          } else {
            console.error(
              "[WebSocket] Authentication failed:",
              response?.message,
            );
            optionsRef.current.onError?.(
              new Error(response?.message || "Auth failed"),
            );
          }
        },
      );
    });

    socket.on("disconnect", (reason) => {
      console.log("[WebSocket] Disconnected:", reason);
      connectingRef.current = false;
      setIsConnected(false);
      optionsRef.current.onDisconnect?.();
    });

    socket.on("connect_error", (error) => {
      // Reduce log spam - only log first error
      if (!socketRef.current) {
        console.error("[WebSocket] Connection error:", error.message);
      }
      connectingRef.current = false;
      setIsConnecting(false);
      optionsRef.current.onError?.(error);
    });

    socketRef.current = socket;
  }, []); // Empty deps - uses refs for all values

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      connectingRef.current = false;
      setIsConnected(false);
    }
  }, []);

  const subscribe = useCallback((events: RealTimeEvent[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("subscribe", { events });
    }
  }, []);

  const on = useCallback(
    <T>(
      event: RealTimeEvent,
      callback: (data: WebSocketPayload<T>) => void,
    ) => {
      const socket = socketRef.current;
      if (!socket) {
        return () => {};
      }

      const handler = (payload: WebSocketPayload<T>) => {
        setLastMessage(payload);
        callback(payload);
      };

      socket.on(event, handler);

      // Return cleanup function
      return () => {
        socket.off(event, handler);
      };
    },
    [],
  );

  // Auto-connect when session is available - only run once when merchantId becomes available
  useEffect(() => {
    if (
      autoConnect &&
      merchantId &&
      !socketRef.current &&
      !connectingRef.current
    ) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, merchantId]); // Removed connect/disconnect from deps - they're stable now

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    subscribe,
    on,
    lastMessage,
  };
}

/**
 * Hook to listen to specific WebSocket events
 */
export function useWebSocketEvent<T = any>(
  event: RealTimeEvent,
  callback: (data: T) => void,
  deps: any[] = [],
) {
  const { on, isConnected } = useWebSocket({ autoConnect: true });
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = on<T>(event, (payload) => {
      callbackRef.current(payload.data);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, event, on, ...deps]);
}
