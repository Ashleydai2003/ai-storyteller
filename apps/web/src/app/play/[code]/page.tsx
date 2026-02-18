"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePartySocket } from "@/hooks/usePartySocket";
import { useRoomStore, selectPlayers, selectPhase } from "@/stores/roomStore";
import type { RoomState, ServerMessage, NightAction } from "@ai-botc/game-logic";
import {
  CHARACTER_DISPLAY_NAMES,
  CHARACTER_TYPE_DISPLAY,
  CHARACTER_TYPE_COLORS,
  CHARACTER_TYPE_BG,
} from "@/lib/characterNames";

// Generate or restore a stable client token for this room
function getOrCreateToken(code: string): string {
  const key = `botc-token:${code}`;
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(key, token);
  }
  return token;
}

export default function PlayerRoom() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const hasCheckedRoom = useRef(false);
  const [roomValid, setRoomValid] = useState<boolean | null>(null);

  const {
    playerName,
    setPlayerName,
    setPlayerId,
    syncRoomState,
    setRoomCode,
    revealedCharacter,
    revealedCharacterType,
    demonBluffs,
    wakePrompt,
    setRevealedCharacter,
    setDemonBluffs,
    setWakePrompt,
  } = useRoomStore();
  const players = useRoomStore(selectPlayers);
  const phase = useRoomStore(selectPhase);

  // Stable client token
  const token = useMemo(
    () => (typeof window !== "undefined" ? getOrCreateToken(code) : ""),
    [code]
  );

  // Restore persisted name for this room
  const storageKey = `botc-player-name:${code}`;
  const savedName =
    typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;

  const [nameInput, setNameInput] = useState("");
  const [hasRejoined, setHasRejoined] = useState(false);
  const [error, setError] = useState("");

  // Set the token as the player ID
  useEffect(() => {
    if (token) {
      setPlayerId(token);
    }
  }, [token, setPlayerId]);

  // Restore player name from storage on mount
  useEffect(() => {
    if (savedName) {
      setPlayerName(savedName);
    }
  }, [savedName, setPlayerName]);

  useEffect(() => {
    setRoomCode(code);
  }, [code, setRoomCode]);

  // Handle all server messages
  const handleMessage = (message: ServerMessage) => {
    if (message.type === "character:reveal") {
      setRevealedCharacter(message.character, message.characterType);
    }
    if (message.type === "demon:bluffs") {
      setDemonBluffs(message.bluffs);
    }
    if (message.type === "player:wake") {
      setWakePrompt(message.prompt);
    }
    if (message.type === "player:sleep") {
      setWakePrompt(null);
    }
  };

  const { send, isConnected } = usePartySocket({
    roomCode: code,
    onMessage: handleMessage,
    onStateSync: (state: RoomState) => {
      if (!hasCheckedRoom.current) {
        hasCheckedRoom.current = true;
        if (!state.hostId) {
          setRoomValid(false);
          return;
        }
        setRoomValid(true);
      }
      syncRoomState(state);
    },
    onError: (msg) => {
      setError(msg);
      if (msg === "Name already taken") {
        sessionStorage.removeItem(storageKey);
        setHasRejoined(false);
        setPlayerName(null);
      }
    },
  });

  // Auto-rejoin on refresh
  useEffect(() => {
    if (isConnected && savedName && token && !hasRejoined) {
      setHasRejoined(true);
      send({ type: "player:join", name: savedName, token });
    }
  }, [isConnected, savedName, token, hasRejoined, send]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = nameInput.trim();

    if (trimmedName.length < 1) {
      setError("Please enter a name");
      return;
    }

    if (trimmedName.length > 20) {
      setError("Name must be 20 characters or less");
      return;
    }

    setPlayerName(trimmedName);
    send({ type: "player:join", name: trimmedName, token });
    setError("");
  };

  // Derive join status from server-synced player list
  const hasJoined = players.some((p) => p.id === token);

  // Persist name to sessionStorage once confirmed
  useEffect(() => {
    if (hasJoined && playerName) {
      sessionStorage.setItem(storageKey, playerName);
    }
  }, [hasJoined, playerName, storageKey]);

  // ─── Room not found ───
  if (roomValid === false) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-4">Room Not Found</h1>
        <p className="text-gray-400 mb-8">
          No room exists with code{" "}
          <span className="font-mono font-bold">{code}</span>
        </p>
        <button
          onClick={() => router.push("/join")}
          className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
        >
          Back to Join
        </button>
      </main>
    );
  }

  // ─── Connecting ───
  if (roomValid === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-xl text-gray-400">Connecting to room...</p>
      </main>
    );
  }

  // ─── Name entry ───
  if (!hasJoined) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">Joining Room</p>
          <h1 className="text-4xl font-mono font-bold tracking-widest">
            {code}
          </h1>
        </div>

        <form onSubmit={handleJoin} className="w-full max-w-xs">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => {
              setNameInput(e.target.value);
              setError("");
            }}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full text-center text-2xl py-4 px-6 bg-gray-800 border border-gray-600 rounded-lg mb-4"
            autoFocus
          />

          {error && <p className="text-red-500 text-center mb-4">{error}</p>}

          <button
            type="submit"
            disabled={!isConnected || nameInput.trim().length === 0}
            className="w-full bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
          >
            {isConnected ? "Join Game" : "Connecting..."}
          </button>
        </form>
      </main>
    );
  }

  // ─── Waiting for game to start ───
  if (phase === "waiting") {
    return (
      <main className="flex min-h-screen flex-col items-center p-8">
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">Room {code}</p>
          <h1 className="text-3xl font-bold">Welcome, {playerName}!</h1>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">
              Players ({players.length})
            </h2>

            <ul className="space-y-2">
              {players.map((player) => (
                <li
                  key={player.id}
                  className={`px-4 py-2 rounded flex items-center ${
                    player.id === token
                      ? "bg-red-900/50 border border-red-700"
                      : "bg-gray-700"
                  }`}
                >
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3" />
                  {player.name}
                  {player.id === token && (
                    <span className="ml-auto text-gray-400 text-sm">
                      (you)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-center text-gray-400 mt-6">
            Waiting for host to start the game...
          </p>

          {error && (
            <p className="text-red-500 text-center mt-4">{error}</p>
          )}
        </div>
      </main>
    );
  }

  // ─── Setup phase: show character ───
  if (phase === "setup") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">Room {code}</p>
          <h1 className="text-2xl font-bold mb-6">{playerName}</h1>
        </div>

        {revealedCharacter && revealedCharacterType ? (
          <div className="w-full max-w-sm">
            <div
              className={`border rounded-xl p-8 text-center ${CHARACTER_TYPE_BG[revealedCharacterType]}`}
            >
              <p className="text-sm uppercase tracking-wider text-gray-400 mb-2">
                Your Character
              </p>
              <h2 className="text-4xl font-bold mb-3">
                {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
              </h2>
              <p
                className={`text-lg font-semibold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}
              >
                {CHARACTER_TYPE_DISPLAY[revealedCharacterType]}
              </p>
            </div>

            <p className="text-center text-gray-400 mt-8 text-sm">
              The host is arranging seating...
            </p>
          </div>
        ) : (
          <p className="text-xl text-gray-400">
            Receiving your character...
          </p>
        )}
      </main>
    );
  }

  // ─── Night phase ───
  if (phase === "night") {
    // Player is awake — show their wake prompt
    if (wakePrompt) {
      if (wakePrompt.promptType === "choose") {
        return <NightChooseScreen
          wakePrompt={wakePrompt}
          revealedCharacter={revealedCharacter}
          revealedCharacterType={revealedCharacterType}
          players={players}
          onSubmit={(targetIds) => {
            const action: NightAction = { action: "choose", targetIds };
            send({ type: "player:nightAction", action });
          }}
        />;
      }

      // Info prompt — show text + "Got it" button
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
          <div className="w-full max-w-sm text-center">
            <h1 className="text-4xl font-bold mb-6 text-yellow-400 animate-pulse">
              Wake Up!
            </h1>

            {revealedCharacter && revealedCharacterType && (
              <div
                className={`border rounded-xl p-4 mb-6 text-center ${CHARACTER_TYPE_BG[revealedCharacterType]}`}
              >
                <p className="text-sm text-gray-400">You are the</p>
                <p
                  className={`text-2xl font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}
                >
                  {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
                </p>
              </div>
            )}

            <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 mb-6">
              <p className="text-lg leading-relaxed whitespace-pre-line">{wakePrompt.instruction}</p>
            </div>

            {revealedCharacterType === "demon" && demonBluffs && demonBluffs.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
                <p className="text-sm uppercase tracking-wider text-gray-400 mb-3">
                  These characters are not in play
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {demonBluffs.map((bluff) => (
                    <span
                      key={bluff}
                      className="bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium"
                    >
                      {CHARACTER_DISPLAY_NAMES[bluff]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => send({ type: "player:acknowledge" })}
              className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
            >
              Got it — Go back to sleep
            </button>
          </div>
        </main>
      );
    }

    // Player is sleeping — default night screen
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
        <h1 className="text-4xl font-bold mb-4">🌙 Night Time</h1>
        <p className="text-xl text-gray-400 mb-8">Close your eyes</p>

        {revealedCharacter && revealedCharacterType && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-6 py-3 text-center">
            <p className="text-sm text-gray-500">You are the</p>
            <p
              className={`font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}
            >
              {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
            </p>
          </div>
        )}
      </main>
    );
  }

  // ─── Day phase ───
  if (phase === "day") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold mb-4">☀️ Day Time</h1>
        <p className="text-xl text-gray-400 mb-6">Discussion time</p>

        {revealedCharacter && revealedCharacterType && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-6 py-3 text-center">
            <p className="text-sm text-gray-500">You are the</p>
            <p
              className={`font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}
            >
              {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
            </p>
          </div>
        )}

        {revealedCharacterType === "demon" && demonBluffs && demonBluffs.length > 0 && (
          <div className="mt-6 bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-sm w-full">
            <p className="text-sm uppercase tracking-wider text-gray-400 mb-3 text-center">
              These characters are not in play
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {demonBluffs.map((bluff) => (
                <span
                  key={bluff}
                  className="bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium"
                >
                  {CHARACTER_DISPLAY_NAMES[bluff]}
                </span>
              ))}
            </div>
          </div>
        )}
      </main>
    );
  }

  // ─── Fallback ───
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <p className="text-xl text-gray-400">Phase: {phase}</p>
    </main>
  );
}

// ─── Night choose prompt component ───

import type { WakePrompt, Player, Character, CharacterType } from "@ai-botc/game-logic";

function NightChooseScreen({
  wakePrompt,
  revealedCharacter,
  revealedCharacterType,
  players,
  onSubmit,
}: {
  wakePrompt: WakePrompt;
  revealedCharacter: Character | null;
  revealedCharacterType: CharacterType | null;
  players: Player[];
  onSubmit: (targetIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const required = wakePrompt.selectCount ?? 1;
  const options = wakePrompt.options ?? [];

  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= required) {
        // Replace the first selection
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  const handleConfirm = () => {
    if (selectedIds.length === required) {
      onSubmit(selectedIds);
      setSelectedIds([]);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-4xl font-bold mb-6 text-yellow-400 animate-pulse">
          Wake Up!
        </h1>

        {revealedCharacter && revealedCharacterType && (
          <div
            className={`border rounded-xl p-4 mb-6 text-center ${CHARACTER_TYPE_BG[revealedCharacterType]}`}
          >
            <p className="text-sm text-gray-400">You are the</p>
            <p
              className={`text-2xl font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}
            >
              {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
            </p>
          </div>
        )}

        <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 mb-4">
          <p className="text-lg mb-1">{wakePrompt.instruction}</p>
          <p className="text-sm text-gray-400">
            Select {required} player{required > 1 ? "s" : ""} ({selectedIds.length}/{required})
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {options.map((playerId) => {
            const p = players.find((pl) => pl.id === playerId);
            const isSelected = selectedIds.includes(playerId);
            return (
              <button
                key={playerId}
                onClick={() => togglePlayer(playerId)}
                className={`w-full px-4 py-3 rounded-lg text-left font-medium transition-colors ${
                  isSelected
                    ? "bg-yellow-600 text-white border-2 border-yellow-400"
                    : "bg-gray-800 text-gray-200 border-2 border-gray-700 hover:border-gray-500"
                }`}
              >
                {p?.name ?? playerId}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleConfirm}
          disabled={selectedIds.length !== required}
          className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
        >
          Confirm
        </button>
      </div>
    </main>
  );
}
