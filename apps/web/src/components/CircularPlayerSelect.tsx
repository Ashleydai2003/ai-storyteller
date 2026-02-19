"use client";

import { useMemo } from "react";
import type { Player } from "@ai-botc/game-logic";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CircularPlayerSelectProps {
  /** All players in the game. */
  players: Player[];
  /** Player IDs in seating order (clockwise). */
  seatingOrder: string[];
  /** Player IDs that are selectable (from WakePrompt.options). */
  options: string[];
  /** IDs currently selected. */
  selectedIds: string[];
  /** Called when a selectable player is tapped. */
  onToggle: (playerId: string) => void;
  /** The current player's own ID (to mark "You" in the circle). */
  myId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CircularPlayerSelect({
  players,
  seatingOrder,
  options,
  selectedIds,
  onToggle,
  myId,
}: CircularPlayerSelectProps) {
  // Ordered player list from seating
  const orderedPlayers = useMemo(
    () =>
      seatingOrder
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is Player => p !== undefined),
    [seatingOrder, players]
  );

  // Ring dimensions — responsive based on player count
  const ringSize = useMemo(() => {
    const count = orderedPlayers.length;
    if (count <= 6) return { container: 300, radius: 105 };
    if (count <= 9) return { container: 360, radius: 130 };
    if (count <= 12) return { container: 420, radius: 160 };
    return { container: 480, radius: 190 };
  }, [orderedPlayers.length]);

  const center = ringSize.container / 2;

  return (
    <div
      className="relative mx-auto"
      style={{ width: ringSize.container, height: ringSize.container }}
    >
      {/* Decorative ring */}
      <div
        className="absolute rounded-full border border-gray-700/50 border-dashed"
        style={{
          width: ringSize.radius * 2,
          height: ringSize.radius * 2,
          left: center - ringSize.radius,
          top: center - ringSize.radius,
        }}
      />

      {/* Player seats */}
      {orderedPlayers.map((player, index) => {
        const angle = (2 * Math.PI * index) / orderedPlayers.length - Math.PI / 2;
        const x = center + ringSize.radius * Math.cos(angle);
        const y = center + ringSize.radius * Math.sin(angle);

        const isSelectable = options.includes(player.id);
        const isSelected = selectedIds.includes(player.id);
        const isMe = player.id === myId;
        const isDead = !player.alive;

        return (
          <button
            key={player.id}
            disabled={!isSelectable}
            onClick={() => isSelectable && onToggle(player.id)}
            className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 select-none transition-transform active:scale-95"
            style={{ left: x, top: y }}
          >
            {/* Selection ring */}
            <div
              className={`
                w-14 h-14 rounded-full flex items-center justify-center
                text-base font-bold border-2 transition-all relative
                ${
                  isSelected
                    ? "border-yellow-400 bg-yellow-600/40 shadow-lg shadow-yellow-500/30 scale-110"
                    : isSelectable && isDead
                    ? "border-gray-500 bg-gray-800 hover:border-yellow-500 hover:bg-gray-700 cursor-pointer opacity-60"
                    : isSelectable
                    ? "border-gray-400 bg-gray-700 hover:border-yellow-500 hover:bg-gray-600 cursor-pointer"
                    : isDead
                    ? "border-gray-700 bg-gray-800/50 text-gray-600 opacity-30"
                    : isMe
                    ? "border-blue-500 bg-blue-900/40 text-blue-300"
                    : "border-gray-600 bg-gray-800 text-gray-500 opacity-60"
                }
              `}
            >
              {getInitials(player.name)}
              {/* Skull overlay for dead players */}
              {isDead && (
                <span className="absolute -top-1 -right-1 text-xs leading-none">💀</span>
              )}
            </div>
            {/* Name label */}
            <span
              className={`mt-1 text-[10px] max-w-[4rem] truncate text-center leading-tight ${
                isSelected
                  ? "text-yellow-300 font-semibold"
                  : isMe
                  ? "text-blue-300"
                  : isSelectable && isDead
                  ? "text-gray-500 line-through"
                  : isSelectable
                  ? "text-gray-300"
                  : "text-gray-600"
              }`}
            >
              {isMe ? "You" : player.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
