"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { usePartySocket } from "@/hooks/usePartySocket";
import { useRoomStore, selectPlayers, selectPhase } from "@/stores/roomStore";
import type { RoomState } from "@ai-botc/game-logic";

// Generate or restore a stable host token for this room
function getOrCreateHostToken(code: string): string {
  const key = `botc-host-token:${code}`;
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(key, token);
  }
  return token;
}

export default function HostRoom() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const hasRegisteredHost = useRef(false);

  const { syncRoomState, setRoomCode, setIsHost, roomState } = useRoomStore();
  const players = useRoomStore(selectPlayers);
  const phase = useRoomStore(selectPhase);

  // Stable host token
  const token = useMemo(
    () => (typeof window !== "undefined" ? getOrCreateHostToken(code) : ""),
    [code]
  );

  useEffect(() => {
    setRoomCode(code);
    setIsHost(true);
  }, [code, setRoomCode, setIsHost]);

  const { send, isConnected } = usePartySocket({
    roomCode: code,
    onStateSync: syncRoomState,
  });

  // Register as host when connected
  useEffect(() => {
    if (isConnected && !hasRegisteredHost.current && token) {
      hasRegisteredHost.current = true;
      send({ type: "host:create", token });
    }
  }, [isConnected, token, send]);

  const handleStartGame = () => {
    send({ type: "host:start" });
  };

  const handleSetSeating = useCallback(
    (seatingOrder: string[]) => {
      send({ type: "host:setSeating", seatingOrder });
    },
    [send]
  );

  const handleConfirmSeating = () => {
    send({ type: "host:confirmSeating" });
  };

  const canStart = players.length >= 5;
  const seatingOrder = roomState?.seatingOrder ?? [];

  // ─── Waiting phase ───
  if (phase === "waiting") {
    return (
      <main className="flex min-h-screen flex-col items-center p-8">
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">Room Code</p>
          <h1 className="text-5xl font-mono font-bold tracking-widest">
            {code}
          </h1>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              Players ({players.length}/15)
            </h2>

            {players.length === 0 ? (
              <p className="text-gray-400">Waiting for players to join...</p>
            ) : (
              <ul className="space-y-2">
                {players.map((player) => (
                  <li
                    key={player.id}
                    className="bg-gray-700 px-4 py-2 rounded flex items-center"
                  >
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-3" />
                    {player.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className="w-full bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
          >
            {canStart
              ? "Start Game"
              : `Need ${5 - players.length} more players`}
          </button>

          {!isConnected && (
            <p className="text-yellow-500 text-center mt-4">Connecting...</p>
          )}
        </div>
      </main>
    );
  }

  // ─── Setup phase: arrange seating ───
  if (phase === "setup") {
    // Get players in seating order
    const orderedPlayers = seatingOrder
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean) as typeof players;

    const movePlayer = (index: number, direction: "up" | "down") => {
      const newOrder = [...seatingOrder];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newOrder.length) return;
      [newOrder[index], newOrder[targetIndex]] = [
        newOrder[targetIndex],
        newOrder[index],
      ];
      handleSetSeating(newOrder);
    };

    return (
      <main className="flex min-h-screen flex-col items-center p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">Arrange Seating</h1>
          <p className="text-gray-400">
            Arrange players in their seating order around the table
          </p>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <ul className="space-y-2">
              {orderedPlayers.map((player, index) => (
                <li
                  key={player.id}
                  className="bg-gray-700 px-4 py-3 rounded flex items-center"
                >
                  <span className="text-gray-500 font-mono w-6 text-sm">
                    {index + 1}
                  </span>
                  <span className="flex-1 font-medium">{player.name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => movePlayer(index, "up")}
                      disabled={index === 0}
                      className="p-1.5 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="Move up"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => movePlayer(index, "down")}
                      disabled={index === orderedPlayers.length - 1}
                      className="p-1.5 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="Move down"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleConfirmSeating}
            className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
          >
            Continue to Night
          </button>
        </div>
      </main>
    );
  }

  // ─── Night phase ───
  if (phase === "night") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
        <h1 className="text-4xl font-bold mb-2">🌙 Night Time</h1>
        <p className="text-gray-500 mb-6">
          Round {roomState?.roundNumber ?? 1}
        </p>
        <p className="text-xl text-gray-400">
          Please look only at your own phone
        </p>
      </main>
    );
  }

  // ─── Day phase (placeholder) ───
  if (phase === "day") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold mb-4">☀️ Day Time</h1>
        <p className="text-xl text-gray-400 mb-2">
          Round {roomState?.roundNumber ?? 1}
        </p>
        <p className="text-gray-500">Discussion phase — coming soon</p>
      </main>
    );
  }

  // Fallback for other phases
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <p className="text-xl text-gray-400">Phase: {phase}</p>
    </main>
  );
}
