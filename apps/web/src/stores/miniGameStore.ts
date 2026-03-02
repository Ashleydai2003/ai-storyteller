import { create } from "zustand";

export type GameState = "running" | "paused";

interface MiniGameStore {
  gameState: GameState;
  currentScore: number;

  // Actions
  updateScore: (score: number) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  resetScore: () => void;
}

export const useMiniGameStore = create<MiniGameStore>((set) => ({
  gameState: "running",
  currentScore: 0,

  updateScore: (score) => set({ currentScore: score }),
  pauseGame: () => set({ gameState: "paused" }),
  resumeGame: () => set({ gameState: "running" }),
  resetScore: () => set({ currentScore: 0 }),
}));
