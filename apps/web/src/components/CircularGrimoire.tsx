"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { GrimoireEntry, ReminderToken } from "@ai-botc/game-logic";
import {
  CHARACTER_DISPLAY_NAMES,
  CHARACTER_TYPE_COLORS,
} from "@/lib/characterNames";
import CharacterToken from "./CharacterToken";

interface CircularGrimoireProps {
  /** Grimoire entries in seating order. */
  grimoire: GrimoireEntry[];
}

/** Reminder token image paths */
const REMINDER_TOKEN_IMAGES: Record<string, string> = {
  "died-today": "/reminder_tokens/died-today.jpg",
  "drunk": "/reminder_tokens/drunk.jpg",
  "imp-dead": "/reminder_tokens/imp-dead.jpg",
  "investigator-minion": "/reminder_tokens/investigator-minion.jpg",
  "investigator-wrong": "/reminder_tokens/investigator-wrong.jpg",
  "librarian-outsider": "/reminder_tokens/librarian-outsider.jpg",
  "librarian-wrong": "/reminder_tokens/librarian-wrong.jpg",
  "washerwoman-townsfolk": "/reminder_tokens/washerwoman-townsfolk.jpg",
  "washerwoman-wrong": "/reminder_tokens/washerwoman-wrong.jpg",
  "poisoned": "/reminder_tokens/poisoned.jpg",
  "red-herring": "/reminder_tokens/red-herring.jpg",
  "scarlet-woman-imp": "/reminder_tokens/scarlet-women-imp.jpg",
  "slayer-no-ability": "/reminder_tokens/slayer-no-ability.jpg",
  "virgin-no-ability": "/reminder_tokens/virgin-no-ability.jpg",
  "butler-master": "/reminder_tokens/master.jpg",
  "protected": "/reminder_tokens/safe.jpg",
};

/**
 * Compute ellipse dimensions and token size based on player count.
 * Uses a taller ellipse (portrait orientation) for mobile-friendliness.
 * The ellipse stretches vertically to fit more players without overlap.
 */
function computeEllipseLayout(
  playerCount: number,
  maxWidth: number
): {
  width: number;
  height: number;
  radiusX: number;
  radiusY: number;
  tokenSize: number;
} {
  // Token size - keep them readable
  const tokenSize = playerCount <= 8 ? 72 : playerCount <= 12 ? 64 : 58;

  // Calculate minimum spacing needed between token centers
  // Each token needs space for the image + labels below
  const tokenSpacing = tokenSize + 28;

  // Required ellipse circumference to fit all tokens
  // Approximate circumference ≈ π * √(2 * (a² + b²)) for an ellipse
  const minCircumference = playerCount * tokenSpacing;

  // Constrain width to maxWidth (accounting for token overflow)
  const effectiveMaxWidth = maxWidth - tokenSize - 20;
  const radiusX = Math.min(effectiveMaxWidth / 2, 160); // Max horizontal radius

  // Calculate radiusY to achieve required circumference
  // Using approximation: C ≈ 2π * √((a² + b²) / 2)
  // Solving for b: b = √(2 * (C / 2π)² - a²)
  const cOver2Pi = minCircumference / (2 * Math.PI);
  const radiusYSquared = 2 * cOver2Pi * cOver2Pi - radiusX * radiusX;
  const radiusY = Math.max(radiusX, Math.sqrt(Math.max(0, radiusYSquared)));

  // Container dimensions with padding
  const padding = tokenSize + 30;
  const width = radiusX * 2 + padding;
  const height = radiusY * 2 + padding;

  return { width, height, radiusX, radiusY, tokenSize };
}

/**
 * Compute position on an ellipse for a given index.
 */
function computeEllipsePosition(
  index: number,
  total: number,
  radiusX: number,
  radiusY: number,
  centerX: number,
  centerY: number
): { x: number; y: number } {
  // Start from top (-π/2) and go clockwise
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: centerX + radiusX * Math.cos(angle),
    y: centerY + radiusY * Math.sin(angle),
  };
}

/**
 * Grimoire view for the Spy character.
 * Shows all players with their true characters and states (drunk/poisoned/protected).
 *
 * Uses an elliptical layout that stretches vertically for larger games,
 * making it mobile-friendly while maintaining the circular seating arrangement.
 * The container is scrollable when the ellipse is taller than the viewport.
 */
export default function CircularGrimoire({ grimoire }: CircularGrimoireProps) {
  const total = grimoire.length;

  // Use window width or a reasonable default for SSR
  const maxWidth = typeof window !== "undefined" ? Math.min(window.innerWidth - 32, 400) : 360;

  const layout = useMemo(() => computeEllipseLayout(total, maxWidth), [total, maxWidth]);
  const centerX = layout.width / 2;
  const centerY = layout.height / 2;

  return (
    <div className="w-full overflow-x-hidden overflow-y-auto max-h-[calc(100vh-8rem)] py-4">
      <div
        className="relative mx-auto"
        style={{
          width: layout.width,
          height: layout.height,
        }}
      >
        {/* Decorative ellipse ring */}
        <div
          className="absolute border border-gray-700/30 border-dashed"
          style={{
            width: layout.radiusX * 2,
            height: layout.radiusY * 2,
            left: centerX - layout.radiusX,
            top: centerY - layout.radiusY,
            borderRadius: "50%",
          }}
        />
        {/* Center label */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: centerX - 40,
            top: centerY - 12,
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
          const { x, y } = computeEllipsePosition(
            index,
            total,
            layout.radiusX,
            layout.radiusY,
            centerX,
            centerY
          );

          return (
            <div
              key={entry.playerId}
              className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 select-none"
              style={{ left: x, top: y }}
            >
              <GrimoireToken entry={entry} seatNumber={index + 1} size={layout.tokenSize} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Single grimoire entry token */
function GrimoireToken({
  entry,
  seatNumber,
  size,
}: {
  entry: GrimoireEntry;
  seatNumber: number;
  size: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDead = !entry.alive;
  const reminderTokens = entry.reminderTokens ?? [];
  const hasMultipleTokens = reminderTokens.length > 1;

  return (
    <div className="flex flex-col items-center select-none">
      {/* Token circle with character image */}
      <div className="relative">
        {/* Seat number badge */}
        <div className="absolute -top-1 -left-1 w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center text-[10px] font-mono text-gray-300 z-10">
          {seatNumber}
        </div>

        {/* Character token with grey overlay for dead players (no X) */}
        <div className={isDead ? "opacity-40" : ""}>
          <CharacterToken
            character={entry.character}
            characterType={entry.characterType}
            size={size}
          />
        </div>

        {/* Reminder tokens (top-right corner) - NOT greyed out even if player is dead */}
        {reminderTokens.length > 0 && (
          <div className="absolute -top-5 -right-4 z-20">
            {/* Collapsed state: show first token with count badge if multiple */}
            {!expanded && (
              <div
                className="relative cursor-pointer"
                onClick={() => hasMultipleTokens && setExpanded(true)}
                title={hasMultipleTokens ? `Click to see all ${reminderTokens.length} tokens` : undefined}
              >
                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white bg-gray-800">
                  <Image
                    src={REMINDER_TOKEN_IMAGES[reminderTokens[0]] || "/reminder_tokens/safe.webp"}
                    alt={reminderTokens[0]}
                    width={44}
                    height={44}
                    className="object-cover"
                  />
                </div>
                {hasMultipleTokens && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white">
                    +{reminderTokens.length - 1}
                  </div>
                )}
              </div>
            )}

            {/* Expanded state: show all tokens */}
            {expanded && (
              <div
                className="relative"
                onMouseLeave={() => setExpanded(false)}
                onClick={() => setExpanded(false)}
              >
                <div className="flex flex-col gap-1 bg-gray-900 border-2 border-gray-600 rounded-lg p-1">
                  {reminderTokens.map((token, idx) => (
                    <div
                      key={`${token}-${idx}`}
                      className="w-10 h-10 rounded-full overflow-hidden border border-white bg-gray-800"
                    >
                      <Image
                        src={REMINDER_TOKEN_IMAGES[token] || "/reminder_tokens/safe.webp"}
                        alt={token}
                        width={40}
                        height={40}
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
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
}
