"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMiniGameStore } from "@/stores/miniGameStore";

const COLORS = [
  { base: "bg-red-600", lit: "bg-red-400", shadow: "shadow-red-500/50" },
  { base: "bg-blue-600", lit: "bg-blue-400", shadow: "shadow-blue-500/50" },
  { base: "bg-green-600", lit: "bg-green-400", shadow: "shadow-green-500/50" },
  { base: "bg-yellow-600", lit: "bg-yellow-400", shadow: "shadow-yellow-500/50" },
];

type GamePhase = "waiting" | "showing" | "input" | "success" | "gameover";

/**
 * Simon-style memory game with 4 colored squares.
 * Watch the pattern, then repeat it.
 */
export default function MemoryGame() {
  const { gameState, updateScore } = useMiniGameStore();
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [litSquare, setLitSquare] = useState<number | null>(null);
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [score, setScore] = useState(0);

  const showingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sequenceIndexRef = useRef(0);

  // Add a new random square to the sequence
  const addToSequence = useCallback(() => {
    const next = Math.floor(Math.random() * 4);
    setSequence((prev) => [...prev, next]);
  }, []);

  // Start a new round
  const startNewRound = useCallback(() => {
    addToSequence();
    setPlayerIndex(0);
    sequenceIndexRef.current = 0;
    setPhase("showing");
  }, [addToSequence]);

  // Show the sequence to the player
  useEffect(() => {
    if (phase !== "showing" || gameState !== "running") return;

    const showNext = () => {
      const idx = sequenceIndexRef.current;
      if (idx >= sequence.length) {
        // Done showing, player's turn
        setLitSquare(null);
        setPhase("input");
        return;
      }

      // Light up current square
      setLitSquare(sequence[idx]);
      showingTimeoutRef.current = setTimeout(() => {
        setLitSquare(null);
        showingTimeoutRef.current = setTimeout(() => {
          sequenceIndexRef.current++;
          showNext();
        }, 200);
      }, 500);
    };

    // Small delay before starting to show
    showingTimeoutRef.current = setTimeout(showNext, 500);

    return () => {
      if (showingTimeoutRef.current) {
        clearTimeout(showingTimeoutRef.current);
      }
    };
  }, [phase, sequence, gameState]);

  // Handle player tap
  const handleTap = (index: number) => {
    if (phase !== "input" || gameState !== "running") return;

    // Flash the tapped square
    setLitSquare(index);
    setTimeout(() => setLitSquare(null), 150);

    if (sequence[playerIndex] === index) {
      // Correct!
      const nextIndex = playerIndex + 1;
      if (nextIndex >= sequence.length) {
        // Completed the sequence
        const newScore = score + 1;
        setScore(newScore);
        setPhase("success");
        // Start next round after brief delay
        setTimeout(() => {
          if (gameState === "running") {
            startNewRound();
          }
        }, 800);
      } else {
        setPlayerIndex(nextIndex);
      }
    } else {
      // Wrong! Game over
      setPhase("gameover");
    }
  };

  // Sync score to store
  useEffect(() => {
    updateScore(score);
  }, [score, updateScore]);

  // Start game when running
  useEffect(() => {
    if (gameState === "running" && phase === "waiting") {
      setSequence([]);
      setScore(0);
      setPlayerIndex(0);
      setTimeout(() => {
        startNewRound();
      }, 500);
    }
  }, [gameState, phase, startNewRound]);

  // Reset on game restart after game over
  useEffect(() => {
    if (gameState === "running" && phase === "gameover") {
      setPhase("waiting");
      setSequence([]);
      setScore(0);
      setPlayerIndex(0);
    }
  }, [gameState, phase]);

  // Pause handling
  useEffect(() => {
    if (gameState === "paused" && showingTimeoutRef.current) {
      clearTimeout(showingTimeoutRef.current);
    }
  }, [gameState]);

  return (
    <div className="relative w-full h-full bg-gray-900 flex flex-col items-center justify-center">
      {/* Game board */}
      <div className="grid grid-cols-2 gap-4 p-4">
        {COLORS.map((color, index) => (
          <button
            key={index}
            onClick={() => handleTap(index)}
            disabled={phase !== "input"}
            className={`
              w-28 h-28 sm:w-36 sm:h-36 rounded-xl transition-all duration-100
              ${litSquare === index ? `${color.lit} shadow-lg ${color.shadow}` : color.base}
              ${phase === "input" ? "active:scale-95 cursor-pointer" : "cursor-default"}
              border-2 border-gray-800
            `}
          />
        ))}
      </div>

      {/* Status text */}
      <div className="mt-8 text-center">
        {phase === "waiting" && (
          <p className="text-gray-400 text-lg">Get ready...</p>
        )}
        {phase === "showing" && (
          <p className="text-gray-300 text-lg">Watch the pattern...</p>
        )}
        {phase === "input" && (
          <p className="text-gray-300 text-lg">Your turn! ({playerIndex + 1}/{sequence.length})</p>
        )}
        {phase === "success" && (
          <p className="text-green-400 text-lg font-bold">Correct!</p>
        )}
      </div>

      {/* Game over overlay */}
      {phase === "gameover" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <p className="text-white text-4xl font-bold mb-2">Game Over</p>
            <p className="text-gray-300 text-xl">Score: {score}</p>
          </div>
        </div>
      )}
    </div>
  );
}
