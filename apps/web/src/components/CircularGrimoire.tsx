"use client";

import { useMemo } from "react";
import type { GrimoireEntry } from "@ai-botc/game-logic";
import {
  CHARACTER_DISPLAY_NAMES,
  CHARACTER_TYPE_COLORS,
} from "@/lib/characterNames";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CircularGrimoireProps {
  /** Grimoire entries in seating order. */
  grimoire: GrimoireEntry[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Colour helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TYPE_BORDER: Record<string, string> = {
  townsfolk: "border-blue-500",
  outsider: "border-cyan-500",
  minion: "border-orange-500",
  demon: "border-red-500",
};

const TYPE_BG: Record<string, string> = {
  townsfolk: "bg-blue-900/50",
  outsider: "bg-cyan-900/50",
  minion: "bg-orange-900/50",
  demon: "bg-red-900/50",
};

const STATE_BADGE: Record<string, { label: string; color: string }> = {
  drunk: { label: "D", color: "bg-purple-600" },
  poisoned: { label: "P", color: "bg-green-600" },
  protected: { label: "🛡", color: "bg-blue-600" },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CircularGrimoire({ grimoire }: CircularGrimoireProps) {
  const total = grimoire.length;

  // Ring dimensions — slightly larger to accommodate character labels
  const ringSize = useMemo(() => {
    if (total <= 6) return { container: 340, radius: 120 };
    if (total <= 9) return { container: 400, radius: 150 };
    if (total <= 12) return { container: 460, radius: 180 };
    return { container: 520, radius: 210 };
  }, [total]);

  const center = ringSize.container / 2;

  return (
    <div
      className="relative mx-auto"
      style={{ width: ringSize.container, height: ringSize.container }}
    >
      {/* Decorative ring */}
      <div
        className="absolute rounded-full border border-gray-700/30 border-dashed"
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
          left: center - 40,
          top: center - 12,
          width: 80,
          height: 24,
        }}
      >
        <span className="text-gray-600 text-xs font-mono uppercase tracking-widest">
          Grimoire
        </span>
      </div>

      {/* Player tokens */}
      {grimoire.map((entry, index) => {
        const angle = (2 * Math.PI * index) / total - Math.PI / 2;
        const x = center + ringSize.radius * Math.cos(angle);
        const y = center + ringSize.radius * Math.sin(angle);
        const isDead = !entry.alive;

        return (
          <div
            key={entry.playerId}
            className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 select-none"
            style={{ left: x, top: y }}
          >
            {/* Token circle */}
            <div
              className={`
                relative w-14 h-14 rounded-full flex items-center justify-center
                text-base font-bold border-2 transition-all
                ${TYPE_BORDER[entry.characterType] ?? "border-gray-500"}
                ${TYPE_BG[entry.characterType] ?? "bg-gray-800"}
                ${isDead ? "opacity-40" : ""}
              `}
            >
              {getInitials(entry.playerName)}

              {/* Dead X overlay */}
              {isDead && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-red-500 text-3xl font-black opacity-80">
                    ✕
                  </span>
                </div>
              )}

              {/* State badges (top-right corner stack) */}
              {entry.states.length > 0 && (
                <div className="absolute -top-1 -right-1 flex flex-col gap-0.5">
                  {entry.states.map((s) => {
                    const badge = STATE_BADGE[s];
                    if (!badge) return null;
                    return (
                      <div
                        key={s}
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${badge.color}`}
                        title={s}
                      >
                        {badge.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Player name */}
            <span
              className={`mt-0.5 text-[10px] max-w-[4.5rem] truncate text-center leading-tight ${
                isDead ? "text-gray-600 line-through" : "text-gray-300"
              }`}
            >
              {entry.playerName}
            </span>

            {/* Character + type label */}
            <span
              className={`text-[9px] font-semibold max-w-[5rem] truncate text-center leading-tight ${
                CHARACTER_TYPE_COLORS[entry.characterType] ?? "text-gray-400"
              }`}
            >
              {CHARACTER_DISPLAY_NAMES[entry.character] ?? entry.character}
            </span>
          </div>
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
