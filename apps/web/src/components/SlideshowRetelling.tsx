"use client";

import { useState, useEffect } from "react";
import CircularGrimoire from "./CircularGrimoire";
import type { GrimoireEntry } from "@ai-botc/game-logic";

interface Slide {
  title: string;
  content: string[];
  nightNumber?: number;
}

interface AIRetelling {
  narrative: string;
  highlights: string[];
  notablePlays: string[];
}

interface SlideshowRetellingProps {
  slides: Slide[];
  winner: "good" | "evil";
  winReason: string;
  aiNarrative?: AIRetelling | null;
  grimoire?: GrimoireEntry[] | null;
}

/**
 * Fullscreen retelling component with two modes:
 * - AI mode: Natural language narrative with fade transitions
 * - Slideshow mode: Night-by-night slides
 * Both modes include grimoire as final slide
 */
export default function SlideshowRetelling({
  slides,
  winner,
  winReason,
  aiNarrative,
  grimoire,
}: SlideshowRetellingProps) {
  const isEvilWin = winner === "evil";
  const hasAI = aiNarrative && aiNarrative.narrative;

  // If AI is available, use narrative mode
  if (hasAI) {
    return (
      <AIRetellingMode
        narrative={aiNarrative.narrative}
        highlights={aiNarrative.highlights}
        notablePlays={aiNarrative.notablePlays}
        winner={winner}
        winReason={winReason}
        grimoire={grimoire}
      />
    );
  }

  // Otherwise use slideshow mode
  return (
    <SlideshowMode
      slides={slides}
      winner={winner}
      winReason={winReason}
      grimoire={grimoire}
    />
  );
}

/**
 * AI Narrative Mode: Shows narrative with fade in/out, then slides, then grimoire
 */
function AIRetellingMode({
  narrative,
  highlights,
  notablePlays,
  winner,
  winReason,
  grimoire,
}: {
  narrative: string;
  highlights: string[];
  notablePlays: string[];
  winner: "good" | "evil";
  winReason: string;
  grimoire?: GrimoireEntry[] | null;
}) {
  const [currentView, setCurrentView] = useState<"narrative" | "highlights" | "grimoire">("narrative");
  const [fadeIn, setFadeIn] = useState(true);
  const isEvilWin = winner === "evil";

  const bgGradient = isEvilWin
    ? "linear-gradient(to bottom, #0a0000 0%, #1a0000 50%, #0f0505 100%)"
    : "linear-gradient(to bottom, #000a0f 0%, #001020 50%, #000510 100%)";

  const handleNext = () => {
    setFadeIn(false);
    setTimeout(() => {
      if (currentView === "narrative") {
        setCurrentView("highlights");
      } else if (currentView === "highlights" && grimoire && grimoire.length > 0) {
        setCurrentView("grimoire");
      }
      setFadeIn(true);
    }, 500);
  };

  const handlePrevious = () => {
    setFadeIn(false);
    setTimeout(() => {
      if (currentView === "grimoire") {
        setCurrentView("highlights");
      } else if (currentView === "highlights") {
        setCurrentView("narrative");
      }
      setFadeIn(true);
    }, 500);
  };

  const canGoNext = currentView === "narrative" || (currentView === "highlights" && grimoire && grimoire.length > 0);
  const canGoPrev = currentView === "highlights" || currentView === "grimoire";

  return (
    <main
      className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto p-8"
      style={{ background: bgGradient }}
    >
      {/* Winner badge */}
      <div className="absolute top-8 left-1/2 transform -translate-x-1/2 text-center">
        <div className="text-6xl mb-2">{isEvilWin ? "😈" : "😇"}</div>
        <h1 className={`text-3xl font-extrabold ${isEvilWin ? "text-red-400" : "text-blue-300"}`}>
          {isEvilWin ? "Evil Wins!" : "Good Wins!"}
        </h1>
        <p className="text-gray-400 text-sm mt-1">{winReason}</p>
      </div>

      {/* Main content area with fade transitions */}
      <div
        className={`w-full max-w-4xl mt-32 transition-opacity duration-500 ${
          fadeIn ? "opacity-100" : "opacity-0"
        }`}
      >
        {currentView === "narrative" && (
          <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-10 backdrop-blur-sm">
            <h2 className="text-2xl font-bold text-gray-200 mb-6 text-center">The Tale</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-200 text-lg leading-relaxed whitespace-pre-line">
                {narrative}
              </p>
            </div>
          </div>
        )}

        {currentView === "highlights" && (
          <div className="space-y-6">
            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
                <h2 className="text-2xl font-bold text-gray-200 mb-4 flex items-center gap-2">
                  <span className="text-yellow-500">⭐</span>
                  Key Moments
                </h2>
                <div className="space-y-3">
                  {highlights.map((h, i) => (
                    <div
                      key={i}
                      className="bg-yellow-900/20 border border-yellow-800/30 rounded-xl px-5 py-3 text-gray-200"
                    >
                      {h}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notable plays */}
            {notablePlays.length > 0 && (
              <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
                <h2 className="text-2xl font-bold text-gray-200 mb-4 flex items-center gap-2">
                  <span className="text-purple-400">🎭</span>
                  Notable Plays
                </h2>
                <div className="space-y-3">
                  {notablePlays.map((p, i) => (
                    <div
                      key={i}
                      className="bg-purple-900/20 border border-purple-800/30 rounded-xl px-5 py-3 text-gray-200"
                    >
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === "grimoire" && grimoire && grimoire.length > 0 && (
          <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-10 backdrop-blur-sm">
            <h2 className="text-2xl font-bold text-gray-200 mb-6 text-center">Final Grimoire</h2>
            <CircularGrimoire grimoire={grimoire} />
          </div>
        )}
      </div>

      {/* Navigation controls */}
      <div className="absolute bottom-8 left-8">
        {canGoPrev && (
          <button
            onClick={handlePrevious}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-lg"
          >
            ← Previous
          </button>
        )}
      </div>
      <div className="absolute bottom-8 right-8">
        {canGoNext && (
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-lg"
          >
            Next →
          </button>
        )}
      </div>

      {/* Progress indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
        <div
          className={`w-3 h-3 rounded-full transition-all ${
            currentView === "narrative"
              ? isEvilWin
                ? "bg-red-400 w-8"
                : "bg-blue-300 w-8"
              : "bg-gray-600"
          }`}
        />
        <div
          className={`w-3 h-3 rounded-full transition-all ${
            currentView === "highlights"
              ? isEvilWin
                ? "bg-red-400 w-8"
                : "bg-blue-300 w-8"
              : "bg-gray-600"
          }`}
        />
        {grimoire && grimoire.length > 0 && (
          <div
            className={`w-3 h-3 rounded-full transition-all ${
              currentView === "grimoire"
                ? isEvilWin
                  ? "bg-red-400 w-8"
                  : "bg-blue-300 w-8"
                : "bg-gray-600"
            }`}
          />
        )}
      </div>
    </main>
  );
}

/**
 * Slideshow Mode: Night-by-night slides with grimoire at the end
 */
function SlideshowMode({
  slides,
  winner,
  winReason,
  grimoire,
}: {
  slides: Slide[];
  winner: "good" | "evil";
  winReason: string;
  grimoire?: GrimoireEntry[] | null;
}) {
  // Add grimoire as final slide if available
  const allSlides: (Slide | { type: "grimoire" })[] = grimoire && grimoire.length > 0
    ? [...slides, { type: "grimoire" as const }]
    : slides;

  const [currentSlide, setCurrentSlide] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const isEvilWin = winner === "evil";

  const bgGradient = isEvilWin
    ? "linear-gradient(to bottom, #0a0000 0%, #1a0000 50%, #0f0505 100%)"
    : "linear-gradient(to bottom, #000a0f 0%, #001020 50%, #000510 100%)";

  // Auto-advance every 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentSlide < allSlides.length - 1) {
        setFadeIn(false);
        setTimeout(() => {
          setCurrentSlide((prev) => prev + 1);
          setFadeIn(true);
        }, 300);
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, [currentSlide, allSlides.length]);

  const handleNext = () => {
    if (currentSlide < allSlides.length - 1) {
      setFadeIn(false);
      setTimeout(() => {
        setCurrentSlide((prev) => prev + 1);
        setFadeIn(true);
      }, 300);
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setFadeIn(false);
      setTimeout(() => {
        setCurrentSlide((prev) => prev - 1);
        setFadeIn(true);
      }, 300);
    }
  };

  const currentItem = allSlides[currentSlide];
  const isGrimoireSlide = currentItem && "type" in currentItem && currentItem.type === "grimoire";
  const slide = !isGrimoireSlide ? (currentItem as Slide) : null;

  return (
    <main
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden cursor-pointer"
      style={{ background: bgGradient }}
      onClick={handleNext}
    >
      {/* Slide content */}
      <div
        className={`w-full max-w-4xl px-8 transition-all duration-300 ${
          fadeIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {isGrimoireSlide && grimoire ? (
          <>
            <h1 className={`text-5xl font-extrabold mb-8 text-center ${isEvilWin ? "text-red-400" : "text-blue-300"}`}>
              Final Grimoire
            </h1>
            <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-10 backdrop-blur-sm">
              <CircularGrimoire grimoire={grimoire} />
            </div>
          </>
        ) : slide ? (
          <>
            <h1 className={`text-5xl font-extrabold mb-8 text-center ${isEvilWin ? "text-red-400" : "text-blue-300"}`}>
              {slide.title}
            </h1>
            <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-10 backdrop-blur-sm">
              <div className="space-y-4">
                {slide.content.map((line, i) => (
                  <p
                    key={i}
                    className="text-gray-200 text-2xl leading-relaxed animate-fade-in"
                    style={{ animationDelay: `${i * 0.3}s` }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Navigation dots */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
        {allSlides.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setFadeIn(false);
              setTimeout(() => {
                setCurrentSlide(i);
                setFadeIn(true);
              }, 300);
            }}
            className={`w-3 h-3 rounded-full transition-all ${
              i === currentSlide
                ? isEvilWin
                  ? "bg-red-400 w-8"
                  : "bg-blue-300 w-8"
                : "bg-gray-600 hover:bg-gray-500"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Prev/Next buttons */}
      <div className="absolute bottom-8 left-8">
        {currentSlide > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrevious();
            }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            ← Previous
          </button>
        )}
      </div>
      <div className="absolute bottom-8 right-8">
        {currentSlide < allSlides.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            Next →
          </button>
        )}
      </div>

      {/* Progress indicator */}
      <div className="absolute top-8 right-8 text-gray-500 text-sm">
        {currentSlide + 1} / {allSlides.length}
      </div>
    </main>
  );
}
