"use client";

interface ScoreDisplayProps {
  score: number;
}

/**
 * Fixed score badge that displays in the top-right corner during mini-games.
 */
export default function ScoreDisplay({ score }: ScoreDisplayProps) {
  return (
    <div className="fixed top-4 right-4 z-40 bg-gray-900/90 border-2 border-yellow-500/50 rounded-xl px-6 py-3 backdrop-blur-sm">
      <div className="text-yellow-500 text-sm font-medium mb-1">SCORE</div>
      <div className="text-white text-3xl font-bold">{score}</div>
    </div>
  );
}
