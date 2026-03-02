"use client";

import { useEffect, useState } from "react";

interface DayTimerProps {
  /** Epoch ms when timer expires (from server) */
  endsAt: number | undefined;
  /** Label shown above timer (e.g., "Discussion", "Nominations") */
  label?: string;
  /** Whether to show in compact mode */
  compact?: boolean;
  /** Warning threshold in seconds (timer turns red) */
  warningSeconds?: number;
}

/**
 * Synchronized countdown timer for day phases.
 * Uses server-provided end time (epoch ms) for synchronization.
 */
export default function DayTimer({
  endsAt,
  label,
  compact = false,
  warningSeconds = 30,
}: DayTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!endsAt) return 0;
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(0);
      return;
    }

    // Initial calculation
    const calcSeconds = () => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setSecondsLeft(calcSeconds());

    // Update every second
    const interval = setInterval(() => {
      setSecondsLeft(calcSeconds());
    }, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  if (!endsAt || secondsLeft <= 0) {
    return null;
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isWarning = secondsLeft <= warningSeconds;
  const isUrgent = secondsLeft <= 10;

  const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  if (compact) {
    return (
      <div
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm
          ${isUrgent ? "bg-red-900/80 text-red-300 animate-pulse" :
            isWarning ? "bg-yellow-900/80 text-yellow-300" :
            "bg-gray-800/80 text-gray-300"}
        `}
      >
        {label && <span className="text-xs text-gray-500">{label}</span>}
        <span className="font-bold tabular-nums">{timeString}</span>
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-xl px-6 py-4 text-center border
        ${isUrgent ? "bg-red-900/60 border-red-600" :
          isWarning ? "bg-yellow-900/60 border-yellow-600" :
          "bg-gray-800/60 border-gray-700"}
      `}
    >
      {label && (
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">
          {label}
        </p>
      )}
      <p
        className={`
          text-4xl font-mono font-bold tabular-nums
          ${isUrgent ? "text-red-400 animate-pulse" :
            isWarning ? "text-yellow-400" :
            "text-white"}
        `}
      >
        {timeString}
      </p>
    </div>
  );
}
