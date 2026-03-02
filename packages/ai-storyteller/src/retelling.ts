/**
 * Game retelling generator.
 *
 * Creates a dramatic narrative retelling of a completed game
 * based on the game log and final character assignments.
 */

import type { AIServiceConfig, GameRetellingInput, GameRetellingOutput } from "./types";
import { createClient } from "./client";
import { buildRetellingSystemPrompt, buildRetellingUserPrompt } from "./prompts/retelling";

/**
 * Generate a dramatic retelling of a completed game.
 *
 * @param config - AI service configuration (supports both Anthropic and OpenAI)
 * @param input - Game data for retelling
 * @returns Narrative retelling with highlights and notable plays
 */
export async function generateGameRetelling(
  config: AIServiceConfig,
  input: GameRetellingInput
): Promise<GameRetellingOutput> {
  const client = createClient(config);
  const systemPrompt = buildRetellingSystemPrompt();
  const userPrompt = buildRetellingUserPrompt(input);

  const response = await client.complete(systemPrompt, userPrompt);

  // Parse JSON response
  try {
    const result = JSON.parse(response.text) as GameRetellingOutput;
    return {
      narrative: result.narrative ?? "",
      highlights: result.highlights ?? [],
      notablePlays: result.notablePlays ?? [],
    };
  } catch {
    // If JSON parsing fails, return raw text as narrative
    return {
      narrative: response.text,
      highlights: [],
      notablePlays: [],
    };
  }
}

/**
 * Generate a simple retelling without AI (fallback).
 * Used when AI service is unavailable or disabled.
 */
export function generateFallbackRetelling(input: GameRetellingInput): GameRetellingOutput {
  const { characterAssignments, winner, winReason, roundCount, gameLog } = input;

  const winnerText = winner === "good" ? "Good triumphed" : "Evil prevailed";
  const demon = characterAssignments.find((a) => a.characterType === "demon");

  // Build night-by-night narrative from game log
  const narrativeLines: string[] = [];
  const highlights: string[] = [];

  // Group events by night/day
  let currentNight = 0;
  let currentDay = 0;
  let nightEvents: string[] = [];
  let dayEvents: string[] = [];

  for (const entry of gameLog) {
    const detail = entry.detail as any;

    switch (entry.event) {
      case "night:start":
        if (nightEvents.length > 0) {
          narrativeLines.push(`**Night ${currentNight}:**`);
          narrativeLines.push(...nightEvents);
          narrativeLines.push("");
        }
        currentNight = detail.nightNumber;
        nightEvents = [];
        break;

      case "day:start":
        if (nightEvents.length > 0) {
          narrativeLines.push(`**Night ${currentNight}:**`);
          narrativeLines.push(...nightEvents);
          narrativeLines.push("");
        }
        nightEvents = [];
        currentDay = detail.dayNumber;
        dayEvents = [];
        break;

      case "night:kill":
        if (detail.actuallyDied) {
          nightEvents.push(`- ${detail.killerName} (Imp) killed ${detail.targetName}`);
          highlights.push(`${detail.targetName} killed by Imp`);
        } else if (detail.protected) {
          nightEvents.push(`- ${detail.targetName} was protected by the Monk`);
        } else if (detail.soldier) {
          nightEvents.push(`- ${detail.targetName} (Soldier) survived the Imp's attack`);
        } else if (detail.mayorBounce && detail.bouncedTo) {
          nightEvents.push(`- ${detail.killerName} (Imp) tried to kill ${detail.targetName} (Mayor), but the kill bounced to ${detail.bouncedTo}`);
          highlights.push(`Mayor bounced Imp kill to ${detail.bouncedTo}`);
        }
        break;

      case "night:poison":
        nightEvents.push(`- ${detail.poisonerName} (Poisoner) poisoned ${detail.targetName}`);
        break;

      case "night:protection":
        nightEvents.push(`- ${detail.monkName} (Monk) protected ${detail.targetName}`);
        break;

      case "night:starpass":
        nightEvents.push(`- ${detail.impName} (Imp) starpassed, making ${detail.newImpName} the new Imp`);
        highlights.push(`Starpass: ${detail.newImpName} became Imp`);
        break;

      case "night:info":
        if (detail.states?.length > 0) {
          nightEvents.push(`- ${detail.playerName} (${detail.character}) received false information while ${detail.states.join(' and ')}`);
        }
        break;

      case "day:execution":
        const charInfo = detail.character;
        dayEvents.push(`- ${detail.playerName} (${charInfo}) was executed`);
        highlights.push(`${detail.playerName} (${charInfo}) executed`);
        break;

      case "day:slay":
        if (detail.success) {
          dayEvents.push(`- ${detail.slayerName} (Slayer) successfully slayed ${detail.targetName}`);
          highlights.push(`Slayer killed ${detail.targetName}`);
        }
        break;

      case "day:virgin":
        if (detail.triggered) {
          dayEvents.push(`- ${detail.virginName} (Virgin) was nominated by ${detail.nominatorName}, triggering the Virgin ability and killing ${detail.nominatorName}`);
          highlights.push(`Virgin killed ${detail.nominatorName}`);
        }
        break;
    }
  }

  // Add final night/day if any
  if (nightEvents.length > 0) {
    narrativeLines.push(`**Night ${currentNight}**`);
    narrativeLines.push(...nightEvents);
    narrativeLines.push("");
  }
  if (dayEvents.length > 0) {
    narrativeLines.push(`**Day ${currentDay}**`);
    narrativeLines.push(...dayEvents);
    narrativeLines.push("");
  }

  // Conclusion
  if (demon) {
    narrativeLines.push(`Demon: ${demon.playerName} (${demon.character})`);
  }
  narrativeLines.push(`${winReason}`);

  const narrative = narrativeLines.join("\n");

  return {
    narrative,
    highlights: [winReason, ...highlights.slice(0, 5)], // Limit to 5 highlights
    notablePlays: [],
  };
}
