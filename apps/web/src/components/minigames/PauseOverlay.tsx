"use client";

import { useEffect, useState } from "react";

interface PauseOverlayProps {
  show: boolean;
  countdownState: "ready" | "go" | null;
}

/**
 * Full-screen overlay that shows "READY?" → "GO!" countdown
 * when resuming a paused mini-game.
 */
export default function PauseOverlay({ show, countdownState }: PauseOverlayProps) {
  if (!show || !countdownState) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`text-8xl font-extrabold animate-pulse ${
          countdownState === "ready" ? "text-yellow-400" : "text-green-400"
        }`}
      >
        {countdownState === "ready" ? "READY?" : "GO!"}
      </div>
    </div>
  );
}
