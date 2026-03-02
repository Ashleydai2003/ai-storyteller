"use client";

import { useState, useEffect } from "react";
import CircularGrimoire from "./CircularGrimoire";
import type { GrimoireEntry } from "@ai-botc/game-logic";

interface GameOverPresentationProps {
  winner: "good" | "evil";
  winReason: string;
  retelling: {
    narrative: string;
    highlights: string[];
    notablePlays: string[];
  } | null;
  retellingLoading: boolean;
  retellingError: string | null;
  grimoire: GrimoireEntry[] | null;
  grimoireLoading: boolean;
}

type Stage = "blackout" | "reveal" | "reason" | "retelling";

/**
 * Dramatic multi-stage game over presentation.
 * Stages: blackout → winner reveal → reason → retelling
 */
export default function GameOverPresentation({
  winner,
  winReason,
  retelling,
  retellingLoading,
  retellingError,
  grimoire,
  grimoireLoading,
}: GameOverPresentationProps) {
  const [stage, setStage] = useState<Stage>("blackout");
  const [showNarrative, setShowNarrative] = useState(false);
  const isEvilWin = winner === "evil";

  // Progress through stages
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Blackout for suspense
    timers.push(setTimeout(() => setStage("reveal"), 1500));
    // Show winner
    timers.push(setTimeout(() => setStage("reason"), 4000));
    // Show reason, then retelling
    timers.push(setTimeout(() => setStage("retelling"), 6500));
    // Start showing narrative with typing effect
    timers.push(setTimeout(() => setShowNarrative(true), 7500));

    return () => timers.forEach(clearTimeout);
  }, []);

  // Background color transitions based on winner
  const bgGradient = isEvilWin
    ? "linear-gradient(to bottom, #0a0000 0%, #1a0000 50%, #0f0505 100%)"
    : "linear-gradient(to bottom, #000a0f 0%, #001020 50%, #000510 100%)";

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-start overflow-y-auto"
      style={{ background: bgGradient }}
    >
      {/* Stage 1: Blackout with suspenseful text */}
      {stage === "blackout" && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
          <p className="text-gray-600 text-2xl font-light animate-pulse">
            The village falls silent...
          </p>
        </div>
      )}

      {/* Main content - fades in after blackout */}
      <div
        className={`w-full flex flex-col items-center px-8 py-12 transition-opacity duration-1000 ${
          stage === "blackout" ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* Winner icon - large dramatic reveal */}
        <div
          className={`transition-all duration-1000 ease-out ${
            stage === "blackout"
              ? "scale-0 opacity-0"
              : stage === "reveal"
              ? "scale-150 opacity-100"
              : "scale-100 opacity-100"
          }`}
        >
          <div className="text-8xl mb-4">
            {isEvilWin ? "😈" : "😇"}
          </div>
        </div>

        {/* Winner text */}
        <h1
          className={`font-extrabold mb-4 transition-all duration-700 ${
            isEvilWin ? "text-red-400" : "text-blue-300"
          } ${
            stage === "blackout" || stage === "reveal"
              ? "text-6xl opacity-0 translate-y-4"
              : "text-5xl opacity-100 translate-y-0"
          }`}
          style={{
            transitionDelay: stage === "reason" || stage === "retelling" ? "0ms" : "500ms",
          }}
        >
          {isEvilWin ? "Evil Wins!" : "Good Wins!"}
        </h1>

        {/* Win reason */}
        <p
          className={`text-gray-400 text-lg max-w-md text-center transition-all duration-700 ${
            stage === "reason" || stage === "retelling"
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          {winReason}
        </p>

        {/* Retelling section */}
        <div
          className={`w-full max-w-2xl mt-12 transition-all duration-1000 ${
            stage === "retelling" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {retellingLoading && (
            <div className="text-center py-8">
              <div className="relative inline-block">
                <div className="w-12 h-12 rounded-full border-2 border-gray-700 border-t-gray-400 animate-spin" />
              </div>
              <p className="text-gray-500 text-sm italic mt-4">
                The storyteller is crafting your tale...
              </p>
            </div>
          )}

          {retellingError && (
            <p className="text-gray-600 text-sm text-center py-8">{retellingError}</p>
          )}

          {retelling && showNarrative && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              {/* Decorative divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
                <span className="text-gray-500 text-sm uppercase tracking-widest">The Tale</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
              </div>

              {/* Main narrative */}
              <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
                <p className="text-gray-200 leading-relaxed whitespace-pre-line text-lg font-light">
                  {retelling.narrative}
                </p>
              </div>

              {/* Highlights */}
              {retelling.highlights.length > 0 && (
                <div className="animate-in fade-in duration-1000" style={{ animationDelay: "500ms" }}>
                  <h3 className="text-lg font-semibold text-gray-400 mb-4 flex items-center gap-2">
                    <span className="text-yellow-500">⭐</span>
                    Key Moments
                  </h3>
                  <div className="space-y-2">
                    {retelling.highlights.map((h, i) => (
                      <div
                        key={i}
                        className="bg-yellow-900/20 border border-yellow-800/30 rounded-xl px-5 py-3 text-gray-300"
                        style={{ animationDelay: `${600 + i * 150}ms` }}
                      >
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notable plays */}
              {retelling.notablePlays.length > 0 && (
                <div className="animate-in fade-in duration-1000" style={{ animationDelay: "800ms" }}>
                  <h3 className="text-lg font-semibold text-gray-400 mb-4 flex items-center gap-2">
                    <span className="text-purple-400">🎭</span>
                    Notable Plays
                  </h3>
                  <div className="space-y-2">
                    {retelling.notablePlays.map((p, i) => (
                      <div
                        key={i}
                        className="bg-purple-900/20 border border-purple-800/30 rounded-xl px-5 py-3 text-gray-300"
                        style={{ animationDelay: `${900 + i * 150}ms` }}
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Grimoire section */}
        <div
          className={`w-full max-w-4xl mt-12 transition-all duration-1000 ${
            stage === "retelling" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {grimoireLoading && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm italic">Loading grimoire...</p>
            </div>
          )}

          {grimoire && grimoire.length > 0 && (
            <div className="space-y-4 animate-in fade-in duration-1000" style={{ animationDelay: "1200ms" }}>
              {/* Decorative divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
                <span className="text-gray-500 text-sm uppercase tracking-widest">Final Grimoire</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
              </div>

              {/* Grimoire display */}
              <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
                <CircularGrimoire grimoire={grimoire} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`mt-16 pb-8 transition-opacity duration-1000 ${
            stage === "retelling" ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="text-gray-600 text-sm tracking-wider uppercase">
            Game Over
          </p>
        </div>
      </div>
    </main>
  );
}
