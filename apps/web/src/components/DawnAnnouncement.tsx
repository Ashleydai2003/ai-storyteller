"use client";

import { useState, useEffect } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Morning chime — synthesised with Web Audio API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function playMorningChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      // Safari fallback
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Gentle ascending C-major arpeggio: C5 E5 G5 C6
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.value = freq;

      const t0 = ctx.currentTime + i * 0.32;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);

      osc.start(t0);
      osc.stop(t0 + 1.7);
    });

    // Clean up context after all notes finish
    setTimeout(() => ctx.close().catch(() => {}), 5000);
  } catch {
    // AudioContext unavailable or blocked — silently skip
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DawnAnnouncementProps {
  /** Player names who died last night. Empty = nobody died. */
  deaths: string[];
  round: number;
  /** Called when the announcement is dismissed. */
  onDone: () => void;
  /** If false (player screens), auto-dismiss after animation. Default true. */
  showButton?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Animation stages
// Each stage fades in at a staggered delay, all using the same
// CSS class so Tailwind doesn't purge the keyframe utilities.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Stage = "opening" | "death" | "ready";

export default function DawnAnnouncement({
  deaths,
  round,
  onDone,
  showButton = true,
}: DawnAnnouncementProps) {
  const [stage, setStage] = useState<Stage>("opening");

  // Play morning chime once when the announcement appears
  useEffect(() => {
    playMorningChime();
  }, []);

  // Progress through stages automatically; auto-dismiss if no button
  useEffect(() => {
    const t1 = setTimeout(() => setStage("death"), 2200);
    const t2 = setTimeout(() => setStage("ready"), 4800);
    // If no button, auto-dismiss shortly after reaching "ready"
    const t3 = !showButton ? setTimeout(() => onDone(), 6400) : null;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [showButton, onDone]);

  const nobodyDied = deaths.length === 0;
  const multiDead = deaths.length > 1;

  // Compose narrative strings
  const openingLine =
    round === 1
      ? "As the sun rises on the first day…"
      : "Last night, while the village slept…";

  const deathLine = nobodyDied
    ? "No one was found dead."
    : multiDead
    ? `${deaths.slice(0, -1).join(", ")} and ${deaths[deaths.length - 1]} were found dead.`
    : `${deaths[0]} was found dead.`;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-8 z-50"
      style={{ background: "linear-gradient(to bottom, #0f0a04 0%, #1a0f00 100%)" }}
    >
      {/* Opening line */}
      <p
        className="text-gray-400 text-lg italic text-center mb-8 transition-all duration-1000"
        style={{
          opacity: stage === "opening" || stage === "death" || stage === "ready" ? 1 : 0,
          transform:
            stage === "opening" || stage === "death" || stage === "ready"
              ? "translateY(0)"
              : "translateY(12px)",
          animation: "fadeInUp 1.2s ease forwards",
        }}
      >
        {openingLine}
      </p>

      {/* Death announcement — fades in after opening */}
      <div
        style={{
          opacity: stage === "death" || stage === "ready" ? 1 : 0,
          transform:
            stage === "death" || stage === "ready"
              ? "translateY(0)"
              : "translateY(16px)",
          transition: "opacity 1.4s ease, transform 1.4s ease",
        }}
        className="text-center mb-10"
      >
        {nobodyDied ? (
          <p className="text-2xl font-semibold text-gray-300">
            No one was found dead.
          </p>
        ) : (
          <>
            <p className="text-gray-400 mb-3 text-sm uppercase tracking-widest">
              {multiDead ? "The dead" : "The dead"}
            </p>
            <div className="flex flex-col items-center gap-2 mb-4">
              {deaths.map((name) => (
                <p key={name} className="text-3xl font-bold text-red-400">
                  {name}
                </p>
              ))}
            </div>
            <p className="text-gray-400 text-base">
              {multiDead ? "were found dead at dawn." : "was found dead at dawn."}
            </p>
          </>
        )}
      </div>

      {/* Continue button — host only, appears last */}
      {showButton && (
        <button
          onClick={onDone}
          style={{
            opacity: stage === "ready" ? 1 : 0,
            transform: stage === "ready" ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.8s ease, transform 0.8s ease",
            pointerEvents: stage === "ready" ? "auto" : "none",
          }}
          className="bg-amber-700 hover:bg-amber-600 text-white font-bold py-3 px-10 rounded-lg text-lg"
        >
          Begin Day {round}
        </button>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
