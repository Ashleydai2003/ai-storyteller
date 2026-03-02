/**
 * WebSocket hook for PartyKit connection.
 *
 * Manages the WebSocket lifecycle and provides typed message handling.
 * Uses refs for callbacks to avoid reconnecting when handlers change.
 */
import { useEffect, useRef, useCallback, useState } from "react";
import PartySocket from "partysocket";
import type { ClientMessage, ServerMessage, RoomState } from "@ai-botc/game-logic";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

interface UsePartySocketOptions {
  /** Room code to connect to (case-insensitive) */
  roomCode: string;
  /** Called for every server message */
  onMessage?: (message: ServerMessage) => void;
  /** Called specifically for state sync messages */
  onStateSync?: (state: RoomState) => void;
  /** Called when server sends an error message */
  onError?: (error: string) => void;
}

/**
 * Hook that maintains a WebSocket connection to a PartyKit room.
 *
 * @returns send - Function to send typed messages to the server
 * @returns isConnected - Whether the socket is currently connected
 */
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

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode.toLowerCase(),
    });

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (!isActive) return;
      setIsConnected(true);
    });

    socket.addEventListener("close", () => {
      if (!isActive) return;
      setIsConnected(false);
    });

    socket.addEventListener("message", (event) => {
      if (!isActive) return;
      try {
        const message = JSON.parse(event.data) as ServerMessage;

        if (message.type === "sync" && onStateSyncRef.current) {
          onStateSyncRef.current(message.state);
        }

        if (message.type === "error" && onErrorRef.current) {
          onErrorRef.current(message.message);
        }

        if (onMessageRef.current) {
          onMessageRef.current(message);
        }
      } catch {
        // Parse error — ignore malformed messages
      }
    });

    return () => {
      isActive = false;
      socket.close();
      socketRef.current = null;
    };
  }, [roomCode]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      // Retry after a short delay in case socket is still connecting
      setTimeout(() => {
        const retrySocket = socketRef.current;
        if (retrySocket && retrySocket.readyState === retrySocket.OPEN) {
          retrySocket.send(JSON.stringify(message));
        }
      }, 100);
    }
  }, []);

  return { send, isConnected };
}
