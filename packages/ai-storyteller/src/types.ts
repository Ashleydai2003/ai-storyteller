/**
 * Types for the AI Storyteller service layer.
 *
 * This service handles all creative/generative AI tasks:
 * - Game retelling at end of game
 * - (Future) Drunk/poisoned misinformation generation
 * - (Future) Character selection suggestions
 * - (Future) Narrative flavor text for events
 */

import type { GameLogEntry, Character, CharacterType } from "@ai-botc/game-logic";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export type AIProvider = "anthropic" | "openai";

export interface AIServiceConfig {
  /** Which provider to use */
  provider: AIProvider;
  /** API key for the selected provider */
  apiKey: string;
  /** Model to use (defaults: claude-sonnet-4-20250514 or gpt-4o) */
  model?: string;
  /** Maximum tokens for responses */
  maxTokens?: number;
}

// ─────────────────────────────────────────────────────────────
// Game Retelling
// ─────────────────────────────────────────────────────────────

/** Input for generating a game retelling */
export interface GameRetellingInput {
  /** Full game log from start to finish */
  gameLog: GameLogEntry[];
  /** Final character assignments (revealed at game end) */
  characterAssignments: Array<{
    playerName: string;
    character: Character;
    characterType: CharacterType;
    /** Was this player the Drunk (saw different character)? */
    wasDrunk: boolean;
  }>;
  /** Which team won */
  winner: "good" | "evil";
  /** How the game ended */
  winReason: string;
  /** Player count */
  playerCount: number;
  /** Number of rounds played */
  roundCount: number;
}

/** Output from game retelling generation */
export interface GameRetellingOutput {
  /** The narrative retelling of the game */
  narrative: string;
  /** Key dramatic moments highlighted */
  highlights: string[];
  /** MVP or notable player actions */
  notablePlays: Array<{
    playerName: string;
    description: string;
  }>;
}

// ─────────────────────────────────────────────────────────────
// Misinformation Generation (Future)
// ─────────────────────────────────────────────────────────────

/** Input for generating drunk/poisoned misinformation */
export interface MisinformationInput {
  /** The character whose ability is malfunctioning */
  character: Character;
  /** True information that would be given if sober */
  trueInfo: {
    type: "players" | "count" | "yesno";
    /** For player-based info (Washerwoman, etc.) */
    players?: string[];
    /** For count-based info (Chef, Empath) */
    count?: number;
    /** For yes/no info (Fortune Teller) */
    answer?: boolean;
  };
  /** All players (for generating plausible false info) */
  allPlayers: Array<{ id: string; name: string; alive: boolean }>;
  /** Characters in play (for generating plausible false characters) */
  charactersInPlay: Character[];
}

/** Output from misinformation generation */
export interface MisinformationOutput {
  /** The false information to give */
  falseInfo: {
    type: "players" | "count" | "yesno";
    players?: string[];
    count?: number;
    answer?: boolean;
  };
  /** Brief explanation of why this misinformation was chosen (for logging) */
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────
// Character Selection (Future)
// ─────────────────────────────────────────────────────────────

/** Input for suggesting character bag composition */
export interface CharacterSuggestionInput {
  /** Number of players */
  playerCount: number;
  /** Previous games played by this group (for variety) */
  previousGames?: Array<{
    charactersUsed: Character[];
    winner: "good" | "evil";
  }>;
  /** Host preferences */
  preferences?: {
    /** Prefer more information characters */
    infoHeavy?: boolean;
    /** Prefer more chaos/deception */
    chaosHeavy?: boolean;
    /** Characters to always include */
    mustInclude?: Character[];
    /** Characters to exclude */
    exclude?: Character[];
  };
}

/** Output from character suggestion */
export interface CharacterSuggestionOutput {
  /** Suggested character bag */
  characters: Character[];
  /** Brief explanation of the suggestion */
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────
// Narrative Flavor (Future)
// ─────────────────────────────────────────────────────────────

/** Types of narrative events that can have flavor text */
export type NarrativeEventType =
  | "night_start"
  | "dawn"
  | "execution"
  | "no_execution"
  | "game_end_good"
  | "game_end_evil";

/** Input for generating narrative flavor text */
export interface NarrativeFlavorInput {
  eventType: NarrativeEventType;
  /** Relevant context */
  context: {
    roundNumber?: number;
    playerName?: string;
    deathCount?: number;
  };
}

/** Output from narrative flavor generation */
export interface NarrativeFlavorOutput {
  /** The flavor text */
  text: string;
}
