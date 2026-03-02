/**
 * AI Storyteller Service Layer
 *
 * Handles all creative/generative AI tasks for Blood on the Clocktower:
 *
 * IMPLEMENTED:
 * - Game retelling: Generate dramatic narrative of completed games
 *
 * PLANNED (Future):
 * - Misinformation: Generate plausible false info for drunk/poisoned players
 * - Character suggestions: Suggest interesting character compositions
 * - Narrative flavor: Generate atmospheric text for game events
 *
 * Usage:
 * ```ts
 * import { generateGameRetelling, type AIServiceConfig } from "@ai-botc/ai-storyteller";
 *
 * const config: AIServiceConfig = {
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 * };
 *
 * const retelling = await generateGameRetelling(config, {
 *   gameLog,
 *   characterAssignments,
 *   winner: "good",
 *   winReason: "The Imp was executed",
 *   playerCount: 7,
 *   roundCount: 3,
 * });
 * ```
 */

// Types
export type {
  AIProvider,
  AIServiceConfig,
  GameRetellingInput,
  GameRetellingOutput,
  MisinformationInput,
  MisinformationOutput,
  CharacterSuggestionInput,
  CharacterSuggestionOutput,
  NarrativeEventType,
  NarrativeFlavorInput,
  NarrativeFlavorOutput,
} from "./types";

// Game Retelling
export { generateGameRetelling, generateFallbackRetelling } from "./retelling";

// Client utilities (for advanced usage)
export { createClient, getModel, getMaxTokens } from "./client";
export type { AIClient, AIResponse } from "./client";
