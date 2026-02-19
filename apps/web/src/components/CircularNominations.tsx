"use client";

import { useMemo, useState } from "react";
import type { Player } from "@ai-botc/game-logic";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CircularNominationsProps {
  /** All players in the game. */
  players: Player[];
  /** Player IDs in seating order (clockwise). */
  seatingOrder: string[];
  /** This player's own ID. */
  myId: string;
  /** Player IDs currently on the block. */
  onBlock: string[];
  /** Whether this player still has their nomination left. */
  canINominate: boolean;
  /** Called when this player taps someone to nominate them. */
  onNominate: (targetId: string) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CircularNominations({
  players,
  seatingOrder,
  myId,
  onBlock,
  canINominate,
  onNominate,
}: CircularNominationsProps) {
  // Two-step: first select, then confirm with the Nominate button
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleNominate = () => {
    if (selectedId) {
      onNominate(selectedId);
      setSelectedId(null);
    }
  };

  const orderedPlayers = useMemo(
    () =>
      seatingOrder
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is Player => p !== undefined),
    [seatingOrder, players]
  );

  // Ring dimensions
  const ringSize = useMemo(() => {
    const count = orderedPlayers.length;
    if (count <= 6) return { container: 300, radius: 105 };
    if (count <= 9) return { container: 360, radius: 130 };
    if (count <= 12) return { container: 420, radius: 160 };
    return { container: 480, radius: 190 };
  }, [orderedPlayers.length]);

  const center = ringSize.container / 2;

  const selectedPlayer = selectedId
    ? players.find((p) => p.id === selectedId)
    : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Circle */}
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

        {orderedPlayers.map((player, index) => {
          const angle = (2 * Math.PI * index) / orderedPlayers.length - Math.PI / 2;
          const x = center + ringSize.radius * Math.cos(angle);
          const y = center + ringSize.radius * Math.sin(angle);

          const isMe = player.id === myId;
          const isDead = !player.alive;
          const isOnBlock = onBlock.includes(player.id);
          const isSelected = player.id === selectedId;
          // A player can be nominated if: alive, not already nominated today, not yourself
          const canBeNominated = player.alive && player.ableToBeNominated && !isMe;
          // Clickable only if I can still nominate and this is a valid target
          const isClickable = canINominate && canBeNominated;

          let circleClass =
            "w-14 h-14 rounded-full flex items-center justify-center text-base font-bold border-2 transition-all relative";

          if (isSelected) {
            circleClass +=
              " border-red-400 bg-red-800/50 shadow-lg shadow-red-500/30 scale-110";
          } else if (isOnBlock) {
            circleClass +=
              " border-yellow-400 bg-yellow-700/40 shadow-lg shadow-yellow-500/30";
          } else if (isDead) {
            circleClass += " border-gray-700 bg-gray-800/50 text-gray-600 opacity-40";
          } else if (isMe) {
            circleClass += " border-blue-500 bg-blue-900/40 text-blue-300";
          } else if (!player.ableToBeNominated) {
            circleClass += " border-gray-600 bg-gray-800 text-gray-500 opacity-50";
          } else if (isClickable) {
            circleClass +=
              " border-gray-500 bg-gray-700 hover:border-red-400 hover:bg-red-900/20 cursor-pointer hover:scale-105";
          } else {
            circleClass += " border-gray-600 bg-gray-800 text-gray-400";
          }

          return (
            <button
              key={player.id}
              disabled={!isClickable}
              onClick={() => {
                if (!isClickable) return;
                // Toggle selection
                setSelectedId((prev) => (prev === player.id ? null : player.id));
              }}
              className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 select-none"
              style={{ left: x, top: y }}
            >
              <div className={circleClass}>
                {getInitials(player.name)}

                {/* "On block" crown badge */}
                {isOnBlock && (
                  <span
                    className="absolute -top-3 text-yellow-400 text-base"
                    title="On the block"
                  >
                    👑
                  </span>
                )}

                {/* Dead X */}
                {isDead && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-red-500 text-2xl font-black opacity-70">
                      ✕
                    </span>
                  </div>
                )}
              </div>

              <span
                className={`mt-1 text-[10px] max-w-[4.5rem] truncate text-center leading-tight ${
                  isSelected
                    ? "text-red-300 font-semibold"
                    : isOnBlock
                    ? "text-yellow-300 font-semibold"
                    : isMe
                    ? "text-blue-300"
                    : isDead || !player.ableToBeNominated
                    ? "text-gray-600"
                    : isClickable
                    ? "text-gray-200"
                    : "text-gray-500"
                }`}
              >
                {isMe ? "You" : player.name}
              </span>

              {/* "Nominated" sub-label */}
              {!isDead && !player.ableToBeNominated && !isMe && (
                <span className="text-[9px] text-gray-600 mt-0.5">nominated</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Nominate button — appears once a player is selected */}
      <button
        onClick={handleNominate}
        disabled={!selectedId}
        className={`
          w-full max-w-[14rem] py-3 px-6 rounded-xl font-bold text-lg transition-all
          ${
            selectedId
              ? "bg-red-700 hover:bg-red-600 active:scale-95 text-white shadow-lg shadow-red-900/40"
              : "bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700"
          }
        `}
      >
        {selectedId
          ? `Nominate ${selectedPlayer?.name ?? "…"}`
          : "Select a player"}
      </button>
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
