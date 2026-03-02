"use client";

import { useMemo } from "react";
import type { Player } from "@ai-botc/game-logic";
import {
  computeRingSize,
  computeSeatPosition,
  getInitials,
} from "@/lib/circularLayout";

interface CircularPlayerSelectProps {
  /** All players in the game. */
  players: Player[];
  /** Player IDs in seating order (clockwise). */
  seatingOrder: string[];
  /** Player IDs that are selectable (from WakePrompt.options). */
  options: string[];
  /** Currently selected player IDs. */
  selectedIds: string[];
  /** Called when a selectable player is tapped. */
  onToggle: (playerId: string) => void;
  /** Current player's ID (shows "You" label). */
  myId?: string;
  /** Hide alive/dead status (for night abilities/day slayer). */
  hideAliveStatus?: boolean;
}

/**
 * Circular player selection UI for night actions.
 * Players are arranged in a circle; selectable ones can be tapped to toggle.
 */
export default function CircularPlayerSelect({
  players,
  seatingOrder,
  options,
  selectedIds,
  onToggle,
  myId,
  hideAliveStatus = false,
}: CircularPlayerSelectProps) {
  const orderedPlayers = useMemo(
    () =>
      seatingOrder
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is Player => p !== undefined),
    [seatingOrder, players]
  );

  const ringSize = useMemo(
    () => computeRingSize(orderedPlayers.length),
    [orderedPlayers.length]
  );
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
        const { x, y } = computeSeatPosition(
          index,
          orderedPlayers.length,
          ringSize.radius,
          center
        );

        const isSelectable = options.includes(player.id);
        const isSelected = selectedIds.includes(player.id);
        const isMe = player.id === myId;
        const isDead = hideAliveStatus ? false : !player.alive; // Hide dead status if requested

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
