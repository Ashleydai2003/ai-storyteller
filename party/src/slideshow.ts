/**
 * Slideshow generator - creates night-by-night slides from story log
 */

import type { StoryLogEntry } from "./storyLogger";
import type { RoomState, ServerGameState, Character } from "@ai-botc/game-logic";

export interface Slide {
  title: string;
  content: string[];
  nightNumber?: number;
}

export interface SlideshowRetelling {
  slides: Slide[];
  winner: "good" | "evil";
  winReason: string;
}

/**
 * Build a slideshow retelling from the story log.
 * Each night/day gets its own slide with key events.
 */
export function buildSlideshowRetelling(
  state: RoomState,
  serverState: ServerGameState | null,
  storyLog: StoryLogEntry[]
): SlideshowRetelling {
  const slides: Slide[] = [];

  // Helper to get actual character for a player name
  const getCharacter = (playerName: string): Character | null => {
    if (!serverState?.actualCharacters) return null;

    // Find player by name first
    const player = state.players.find(p => p.name === playerName);
    if (!player) return null;

    // Look up actual character by player ID
    return serverState.actualCharacters.get(player.id) ?? null;
  };

  // Helper to format player with character
  const formatPlayerWithChar = (playerName: string): string => {
    const char = getCharacter(playerName);
    return char ? `${playerName} (${char})` : playerName;
  };

  // Group events by phase (night or day number)
  const phaseEvents: Map<string, StoryLogEntry[]> = new Map();
  let currentPhase = "";

  for (const entry of storyLog) {
    if (entry.event === "night:start") {
      currentPhase = `night-${(entry.detail as any).nightNumber}`;
      phaseEvents.set(currentPhase, []);
    } else if (entry.event === "day:start") {
      currentPhase = `day-${(entry.detail as any).dayNumber}`;
      phaseEvents.set(currentPhase, []);
    } else if (currentPhase) {
      const events = phaseEvents.get(currentPhase) ?? [];
      events.push(entry);
      phaseEvents.set(currentPhase, events);
    }
  }

  // Create slides for each phase
  for (const [phase, events] of phaseEvents.entries()) {
    const [phaseType, phaseNumStr] = phase.split("-");
    const phaseNum = parseInt(phaseNumStr, 10);
    const content: string[] = [];

    if (phaseType === "night") {
      // Night events
      for (const event of events) {
        const detail = event.detail as any;

        switch (event.event) {
          case "night:info":
            // Always show if drunk/poisoned (wrong information)
            if (detail.states?.length > 0) {
              content.push(`🍺 ${detail.playerName} received information while ${detail.states.join(' and ')}: "${detail.infoShown}"`);
            }
            break;

          case "night:kill":
            if (detail.actuallyDied) {
              if (detail.mayorBounce && detail.bouncedTo) {
                content.push(`💀 ${formatPlayerWithChar(detail.killerName)} tried to kill ${formatPlayerWithChar(detail.targetName)}`);
                content.push(`⚡ The kill bounced to ${formatPlayerWithChar(detail.bouncedTo)}`);
              } else {
                content.push(`💀 ${formatPlayerWithChar(detail.killerName)} killed ${formatPlayerWithChar(detail.targetName)}`);
              }
            } else if (detail.protected) {
              content.push(`🛡️ ${formatPlayerWithChar(detail.targetName)} was protected`);
            } else if (detail.soldier) {
              content.push(`⚔️ ${formatPlayerWithChar(detail.targetName)} survived the attack`);
            }
            break;

          case "night:poison":
            content.push(`☠️ ${formatPlayerWithChar(detail.poisonerName)} poisoned ${detail.targetName}`);
            break;

          case "night:protection":
            content.push(`🛡️ ${formatPlayerWithChar(detail.monkName)} protected ${detail.targetName}`);
            break;

          case "night:starpass":
            content.push(`⭐ ${formatPlayerWithChar(detail.impName)} starpassed to ${formatPlayerWithChar(detail.newImpName)}`);
            break;

          case "night:ravenkeeper":
            if (!detail.wasCorrect) {
              content.push(`🐦 ${detail.ravenkeeperName} was shown ${detail.revealedCharacter} for ${detail.targetName} (actually ${detail.actualCharacter})`);
            } else {
              content.push(`🐦 ${detail.ravenkeeperName} correctly learned that ${detail.targetName} is the ${detail.actualCharacter}`);
            }
            break;
        }
      }

      if (content.length > 0) {
        slides.push({
          title: phaseNum === 1 ? "First Night" : `Night ${phaseNum}`,
          content,
          nightNumber: phaseNum,
        });
      }
    } else if (phaseType === "day") {
      // Day events - focus on executions, virgin/slayer attempts, close calls
      let hasSignificantEvent = false;

      for (const event of events) {
        const detail = event.detail as any;

        switch (event.event) {
          case "day:nomination":
            // Only include if it put someone on the block (close to execution)
            if (detail.putOnBlock) {
              const voteDiff = detail.voteCount - detail.votesNeeded;
              if (voteDiff >= -2) { // Close call (within 2 votes)
                content.push(`⚖️ ${detail.nominatedName} put on block (${detail.voteCount}/${detail.votesNeeded} votes)`);
                hasSignificantEvent = true;
              }
            }
            break;

          case "day:virgin":
            // Always include virgin attempts
            if (detail.triggered) {
              content.push(`👼 ${formatPlayerWithChar(detail.virginName)} was nominated by ${formatPlayerWithChar(detail.nominatorName)}`);
              content.push(`💀 ${detail.nominatorName} mysteriously died`);
            } else if (detail.reason) {
              content.push(`👼 Virgin ability failed: ${detail.reason}`);
            }
            hasSignificantEvent = true;
            break;

          case "day:slay":
            // Always include slay attempts
            if (detail.success) {
              content.push(`⚔️ ${formatPlayerWithChar(detail.slayerName)} successfully slayed ${formatPlayerWithChar(detail.targetName)}`);
            } else {
              content.push(`⚔️ ${formatPlayerWithChar(detail.slayerName)} tried to slay ${formatPlayerWithChar(detail.targetName)}`);
              if (detail.reason) {
                content.push(`   ${detail.reason}`);
              }
            }
            hasSignificantEvent = true;
            break;

          case "day:execution":
            // Always include executions
            const executedPlayer = formatPlayerWithChar(detail.playerName);
            const charInfo = getCharacter(detail.playerName);
            const isEvil = charInfo && ["imp", "scarlet_woman", "poisoner", "spy", "baron"].includes(charInfo);
            const evilIcon = isEvil ? " 😈" : "";
            if (detail.tied) {
              content.push(`🪓 ${executedPlayer}${evilIcon} executed in a tie`);
            } else {
              content.push(`🪓 ${executedPlayer}${evilIcon} was executed`);
            }
            hasSignificantEvent = true;
            break;

          case "day:noExecution":
            content.push(`No execution: ${detail.reason}`);
            hasSignificantEvent = true;
            break;

          case "day:deadvote":
            // Show dead votes as they're significant
            content.push(`💀 ${detail.voterName} (dead) voted for ${detail.nominatedName}`);
            hasSignificantEvent = true;
            break;
        }
      }

      if (hasSignificantEvent && content.length > 0) {
        slides.push({
          title: `Day ${phaseNum}`,
          content,
        });
      }
    }
  }

  // Add final slide with winner
  slides.push({
    title: state.winner === "good" ? "🎉 Good Wins!" : "😈 Evil Wins!",
    content: [
      state.winReason ?? "",
      "",
      `Game lasted ${state.roundNumber ?? 1} rounds`
    ],
  });

  return {
    slides,
    winner: state.winner ?? "good",
    winReason: state.winReason ?? "",
  };
}
