/**
 * AI Storyteller integration for the party server.
 *
 * Handles generating game retellings at the end of a game.
 * The AI storyteller is called lazily (on request) rather than
 * automatically at game end, to avoid blocking and unnecessary API calls.
 */

import type { RoomState, ServerGameState } from "@ai-botc/game-logic";
import type { StoryLogEntry } from "./storyLogger";
import {
  generateGameRetelling,
  generateFallbackRetelling,
  type AIServiceConfig,
  type AIProvider,
  type GameRetellingInput,
  type GameRetellingOutput,
} from "@ai-botc/ai-storyteller";

/**
 * Build the input for game retelling from room state and logs.
 */
export function buildRetellingInput(
  state: RoomState,
  _serverState: ServerGameState | null,
  storyLog: StoryLogEntry[]
): GameRetellingInput | null {
  // Only generate retelling for ended games
  if (state.phase !== "ended") return null;

  // Build character assignments from player data
  const characterAssignments = state.players.map((player) => ({
    playerName: player.name,
    character: player.character!,
    characterType: player.characterType!,
    wasDrunk: player.states.includes("drunk"),
  }));

  // Count rounds (last roundNumber)
  const roundCount = state.roundNumber ?? 1;

  return {
    gameLog: storyLog as any, // Cast to expected type - story log is cleaner than debug log
    characterAssignments,
    winner: state.winner ?? "good",
    winReason: state.winReason ?? "Game ended",
    playerCount: state.players.length,
    roundCount,
  };
}

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
}

/**
 * Detect which AI provider to use based on available environment variables.
 */
export function detectAIConfig(): AIConfig | null {
  // Check for OpenAI first (allows users to choose)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return { provider: "openai", apiKey: openaiKey };
  }

  // Fall back to Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return { provider: "anthropic", apiKey: anthropicKey };
  }

  return null;
}

/**
 * Generate a game retelling using the AI service.
 *
 * Falls back to a simple template if AI is unavailable.
 */
export async function generateRetelling(
  input: GameRetellingInput,
  aiConfig?: AIConfig | null
): Promise<GameRetellingOutput> {
  // If no config provided, try to detect
  const config = aiConfig ?? detectAIConfig();

  // If no API key, use fallback
  if (!config) {
    console.log("[STORYTELLER] No API key configured, using fallback");
    return generateFallbackRetelling(input);
  }

  const serviceConfig: AIServiceConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
  };

  try {
    console.log(`[STORYTELLER] Generating AI retelling with ${config.provider}...`);
    const result = await generateGameRetelling(serviceConfig, input);
    console.log("[STORYTELLER] AI retelling generated successfully");
    return result;
  } catch (error) {
    console.error("[STORYTELLER] AI generation failed, using fallback:", error);
    return generateFallbackRetelling(input);
  }
}
