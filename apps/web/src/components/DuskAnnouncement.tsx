"use client";

import { useState, useEffect } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Execution toll — low, sombre bell synthesised with Web Audio
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function playExecutionToll() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Low bell-like strike: fundamental + two overtones, long decay
    const partials = [
      { freq: 130.81, gain: 0.4 },   // C3 — fundamental
      { freq: 261.63, gain: 0.2 },   // C4 — octave
      { freq: 392.0,  gain: 0.1 },   // G4 — fifth
    ];

    partials.forEach(({ freq, gain }) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.value = freq;

      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 5.0);

      osc.start(t0);
      osc.stop(t0 + 5.1);
    });

    setTimeout(() => ctx.close().catch(() => {}), 7000);
  } catch {
    // AudioContext unavailable or blocked — silently skip
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DuskAnnouncementProps {
  /** The executed player's name, or "" if nobody was executed. */
  executedName: string;
  /** Names of players who tied — shown instead of executedName when a tie occurred. */
  tiedNames?: string[];
  round: number;
  /** Called when host presses "Proceed to Night". */
  onDone: () => void;
}

type Stage = "opening" | "reveal" | "ready";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DuskAnnouncement({
  executedName,
  tiedNames,
  round,
  onDone,
}: DuskAnnouncementProps) {
  const [stage, setStage] = useState<Stage>("opening");

  useEffect(() => {
    playExecutionToll();
    const t1 = setTimeout(() => setStage("reveal"), 2200);
    const t2 = setTimeout(() => setStage("ready"),  4800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const isTie     = tiedNames && tiedNames.length > 1;
  const executed  = !isTie && executedName.trim().length > 0;

  const openingLine = `As the sun sets on Day ${round}…`;
  const revealLine  = isTie
    ? "The vote ended in a tie."
    : executed
    ? "The town has spoken."
    : "The town could not decide.";

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-8 z-50"
      style={{ background: "linear-gradient(to bottom, #0f0404 0%, #1a0000 100%)" }}
    >
      {/* Opening line */}
      <p
        className="text-gray-400 text-lg italic text-center mb-8"
        style={{ animation: "duskFadeIn 1.2s ease forwards" }}
      >
        {openingLine}
      </p>

      {/* Reveal */}
      <div
        className="text-center mb-10 transition-all duration-[1400ms] ease-in-out"
        style={{
          opacity:   stage === "reveal" || stage === "ready" ? 1 : 0,
          transform: stage === "reveal" || stage === "ready"
            ? "translateY(0)"
            : "translateY(16px)",
        }}
      >
        <p className="text-gray-500 text-sm uppercase tracking-widest mb-3">
          {revealLine}
        </p>

        {isTie ? (
          <>
            <div className="flex items-center justify-center gap-3 mb-3 flex-wrap">
              {tiedNames!.map((name, i) => (
                <span key={name}>
                  <span className="text-3xl font-bold text-yellow-400">{name}</span>
                  {i < tiedNames!.length - 1 && (
                    <span className="text-gray-500 text-2xl mx-3">&amp;</span>
                  )}
                </span>
              ))}
            </div>
            <p className="text-gray-400 text-base">tied — no one is on the block.</p>
          </>
        ) : executed ? (
          <>
            <p className="text-4xl font-bold text-red-500 mb-2">{executedName}</p>
            <p className="text-gray-400 text-base">was executed.</p>
          </>
        ) : (
          <p className="text-2xl font-semibold text-gray-300">
            No one was executed today.
          </p>
        )}
      </div>

      {/* Proceed button */}
      <button
        onClick={onDone}
        className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold py-3 px-10 rounded-lg text-lg transition-all"
        style={{
          opacity:      stage === "ready" ? 1 : 0,
          transform:    stage === "ready" ? "translateY(0)" : "translateY(8px)",
          transition:   "opacity 0.8s ease, transform 0.8s ease",
          pointerEvents: stage === "ready" ? "auto" : "none",
        }}
      >
        🌙 Proceed to Night {round + 1}
      </button>

      <style>{`
        @keyframes duskFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
