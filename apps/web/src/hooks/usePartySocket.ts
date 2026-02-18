import { useEffect, useRef, useCallback, useState } from "react";
import PartySocket from "partysocket";
import type { ClientMessage, ServerMessage, RoomState } from "@ai-botc/game-logic";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

interface UsePartySocketOptions {
  roomCode: string;
  onMessage?: (message: ServerMessage) => void;
  onStateSync?: (state: RoomState) => void;
  onError?: (error: string) => void;
}

export function usePartySocket({
  roomCode,
  onMessage,
  onStateSync,
  onError,
}: UsePartySocketOptions) {
  const socketRef = useRef<PartySocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Use refs for callbacks to avoid reconnecting when they change
  const onMessageRef = useRef(onMessage);
  const onStateSyncRef = useRef(onStateSync);
  const onErrorRef = useRef(onError);

  // Keep refs up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
    onStateSyncRef.current = onStateSync;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!roomCode) return;

    // Track if this effect instance is still active (handles React Strict Mode)
    let isActive = true;
    console.log(`[SOCKET] Creating socket for room: ${roomCode}`);

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode.toLowerCase(),
    });

    // Assign socket to ref BEFORE adding event listeners
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      // Only update state if this effect instance is still active
      if (!isActive) {
        console.log(`[SOCKET] Ignoring open event for stale socket`);
        return;
      }
      console.log(`[SOCKET] Socket opened for room: ${roomCode}, readyState: ${socket.readyState}`);
      setIsConnected(true);
    });

    socket.addEventListener("close", () => {
      if (!isActive) return;
      console.log(`[SOCKET] Socket closed for room: ${roomCode}`);
      setIsConnected(false);
    });

    socket.addEventListener("message", (event) => {
      if (!isActive) return;
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        console.log(`[SOCKET] Received message:`, message.type);

        if (message.type === "sync" && onStateSyncRef.current) {
          onStateSyncRef.current(message.state);
        }

        if (message.type === "error" && onErrorRef.current) {
          onErrorRef.current(message.message);
        }

        if (onMessageRef.current) {
          onMessageRef.current(message);
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    });

    return () => {
      console.log(`[SOCKET] Cleaning up socket for room: ${roomCode}`);
      isActive = false;
      socket.close();
      socketRef.current = null;
    };
  }, [roomCode]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    console.log(`[CLIENT SEND] Attempting to send:`, message);
    console.log(`[CLIENT SEND] Socket exists:`, !!socket);
    if (socket) {
      console.log(`[CLIENT SEND] Ready state:`, socket.readyState);
      // PartySocket extends ReconnectingWebSocket which has its own OPEN constant
      console.log(`[CLIENT SEND] Socket OPEN constant:`, socket.OPEN);
    }

    // Use socket's own OPEN constant instead of global WebSocket.OPEN
    // to handle ReconnectingWebSocket properly
    if (socket && socket.readyState === socket.OPEN) {
      console.log(`[CLIENT SEND] Sending message...`);
      socket.send(JSON.stringify(message));
    } else {
      console.log(`[CLIENT SEND] Socket not ready, message not sent. Will retry in 100ms...`);
      // Retry after a short delay in case socket is still connecting
      setTimeout(() => {
        const retrySocket = socketRef.current;
        if (retrySocket && retrySocket.readyState === retrySocket.OPEN) {
          console.log(`[CLIENT SEND] Retry successful, sending message...`);
          retrySocket.send(JSON.stringify(message));
        } else {
          console.log(`[CLIENT SEND] Retry failed, socket still not ready`);
        }
      }, 100);
    }
  }, []);

  return {
    send,
    isConnected,
    socket: socketRef.current,
  };
}
