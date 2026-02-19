"use client";

import { useMemo } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PlayerSeat {
  id: string;
  name: string;
  alive: boolean;
}

interface CircularSeatingViewProps {
  players: PlayerSeat[];
  seatingOrder: string[];
  /** Optional: highlight this player ID (e.g. currently nominated). */
  highlightId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component — read-only circular seating display
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CircularSeatingView({
  players,
  seatingOrder,
  highlightId,
}: CircularSeatingViewProps) {
  // Ordered player list from the seating order
  const orderedPlayers = useMemo(
    () =>
      seatingOrder
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is PlayerSeat => p !== undefined),
    [seatingOrder, players]
  );

  // Ring dimensions — same breakpoints as the drag version
  const ringSize = useMemo(() => {
    const count = orderedPlayers.length;
    if (count <= 6) return { container: 320, radius: 110 };
    if (count <= 9) return { container: 380, radius: 140 };
    if (count <= 12) return { container: 440, radius: 170 };
    return { container: 500, radius: 200 };
  }, [orderedPlayers.length]);

  const center = ringSize.container / 2;

  return (
    <div className="flex flex-col items-center">
      {/* Circular ring */}
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
        {/* Center label */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: center - 30,
            top: center - 12,
            width: 60,
            height: 24,
          }}
        >
          <span className="text-gray-600 text-xs font-mono uppercase tracking-widest">
            Table
          </span>
        </div>

        {/* Player seats */}
        {orderedPlayers.map((player, index) => {
          const angle =
            (2 * Math.PI * index) / orderedPlayers.length - Math.PI / 2;
          const x = center + ringSize.radius * Math.cos(angle);
          const y = center + ringSize.radius * Math.sin(angle);
          const isHighlighted = player.id === highlightId;
          const isDead = !player.alive;

          return (
            <div
              key={player.id}
              className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 select-none"
              style={{ left: x, top: y }}
            >
              {/* Seat number badge */}
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center text-[10px] font-mono text-gray-300 z-10">
                {index + 1}
              </div>

              {/* Player circle */}
              <div
                className={`
                  w-16 h-16 rounded-full flex items-center justify-center
                  text-lg font-bold border-2 transition-colors relative
                  ${
                    isHighlighted
                      ? "border-yellow-400 bg-yellow-800/50 shadow-lg shadow-yellow-500/30"
                      : isDead
                      ? "border-gray-700 bg-gray-800/50 text-gray-600"
                      : "border-gray-500 bg-gray-700 text-gray-100"
                  }
                `}
              >
                {getInitials(player.name)}

                {/* Dead X overlay */}
                {isDead && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-red-500 text-3xl font-black opacity-70">
                      ✕
                    </span>
                  </div>
                )}
              </div>

              {/* Name label */}
              <span
                className={`mt-1 text-xs max-w-[5rem] truncate text-center ${
                  isDead
                    ? "text-gray-600 line-through"
                    : isHighlighted
                    ? "text-yellow-300 font-semibold"
                    : "text-gray-300"
                }`}
              >
                {player.name}
              </span>
            </div>
          );
        })}
      </div>
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
