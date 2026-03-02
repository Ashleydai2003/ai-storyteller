"use client";

import { useEffect, useState } from "react";
import { useMiniGameStore } from "@/stores/miniGameStore";
import PauseOverlay from "./PauseOverlay";
import ScoreDisplay from "./ScoreDisplay";
import DinoGame from "./DinoGame";

interface MiniGameContainerProps {
  roundNumber: number;
  wakePrompt: any | null;
}

/**
 * Main container for mini-game during night phase.
 * Handles pause/resume logic and score display.
 */
export default function MiniGameContainer({ roundNumber, wakePrompt }: MiniGameContainerProps) {
  const { gameState, currentScore, pauseGame, resumeGame } = useMiniGameStore();
  const [countdownState, setCountdownState] = useState<"ready" | "go" | null>(null);

  // Handle pause when woken up
  useEffect(() => {
    if (wakePrompt && gameState === "running") {
      pauseGame();
      setCountdownState(null);
    }
  }, [wakePrompt, gameState, pauseGame]);

  // Handle resume countdown after acknowledging
  useEffect(() => {
    if (!wakePrompt && gameState === "paused") {
      setCountdownState("ready");
      const timer1 = setTimeout(() => setCountdownState("go"), 800);
      const timer2 = setTimeout(() => {
        setCountdownState(null);
        resumeGame();
      }, 1400);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [wakePrompt, gameState, resumeGame]);

  return (
    <main className="fixed inset-0 bg-gray-950 overflow-hidden touch-none">
      {/* Score display */}
      <ScoreDisplay score={currentScore} />

      {/* Game title */}
      <div className="absolute top-4 left-4 z-40">
        <h2 className="text-2xl font-bold text-gray-300">Dino Jump</h2>
        <p className="text-sm text-gray-500">Night {roundNumber}</p>
      </div>

      {/* Game content */}
      <div className="w-full h-full">
        <DinoGame />
      </div>

      {/* Pause overlay with countdown */}
      <PauseOverlay show={countdownState !== null} countdownState={countdownState} />
    </main>
  );
}
