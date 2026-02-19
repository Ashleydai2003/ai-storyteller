/**
 * nightSteps.ts — Night character handlers, resolvers, and utilities.
 *
 * Every character that wakes at night has:
 *   • A step handler  (nightStep_*)   — wakes the player, sends a prompt
 *   • A resolver       (resolveNight_*) — processes the player's choice (for "choose" prompts)
 *
 * All functions receive a NightContext to interact with game state
 * without depending on the RoomServer class directly.
 */

import type {
  Player,
  Character,
  GrimoireEntry,
  ServerGameState,
  ServerMessage,
  RoomState,
  NightStep,
  NightAction,
} from "@ai-botc/game-logic";
import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER } from "@ai-botc/game-logic";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Context interface — provided by RoomServer at call-time
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NightContext {
  /** Full room state (players, seating, phase, etc.) */
  state: RoomState;
  /** Server-only state (bluffs, red herring, pending kills, etc.) */
  serverGameState: ServerGameState;
  /** Send a WebSocket message to a player by their stable token. */
  sendToToken(token: string, message: ServerMessage): void;
  /** Append to the persistent game log. */
  addLog(event: string, detail: Record<string, unknown>): Promise<void>;
  /** Persist RoomState to durable storage. */
  persistState(): Promise<void>;
  /** Persist ServerGameState to durable storage. */
  persistServerState(): Promise<void>;
  /** Update the currentStepPhase and persist. */
  setStepPhase(
    phase: ServerGameState["currentStepPhase"]
  ): Promise<void>;
  /** Put the player to sleep and advance to the next night step. */
  sleepAndAdvance(playerId: string): Promise<void>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Fisher-Yates shuffle (returns a new array). */
export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Is the player evil (minion or demon) by actual registration? */
export function isPlayerEvil(player: Player): boolean {
  return (
    player.characterRegistration === "minion" ||
    player.characterRegistration === "demon"
  );
}

/** Convert a character enum ("fortune_teller") to display name ("Fortune Teller"). */
export function charName(character: Character): string {
  return character
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve a list of player IDs to names (for logging). */
export function idsToNames(ids: string[], players: Player[]): string[] {
  return ids.map((id) => {
    const p = players.find((pl) => pl.id === id);
    return p?.name ?? id;
  });
}

/** Get the two nearest alive neighbours in seating order (CW + CCW). */
export function getAliveNeighbors(
  playerId: string,
  players: Player[],
  seatingOrder: string[]
): Player[] {
  const idx = seatingOrder.indexOf(playerId);
  if (idx === -1) return [];

  const neighbors: Player[] = [];
  // Clockwise
  for (let i = 1; i < seatingOrder.length; i++) {
    const p = players.find(
      (pl) => pl.id === seatingOrder[(idx + i) % seatingOrder.length]
    );
    if (p && p.alive && p.id !== playerId) {
      neighbors.push(p);
      break;
    }
  }
  // Counter-clockwise
  for (let i = 1; i < seatingOrder.length; i++) {
    const p = players.find(
      (pl) =>
        pl.id ===
        seatingOrder[(idx - i + seatingOrder.length) % seatingOrder.length]
    );
    if (p && p.alive && p.id !== playerId) {
      if (!neighbors.some((n) => n.id === p.id)) neighbors.push(p);
      break;
    }
  }
  return neighbors;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Night order — pre-computed once at game start, used every night
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build the first-night and other-nights wake orders from the
 * assigned player list.  Called once after character assignment
 * and stored in ServerGameState.
 *
 * The canonical order comes from FIRST_NIGHT_ORDER / OTHER_NIGHT_ORDER.
 * Only characters actually in play get an entry.
 */
export function buildNightOrders(players: Player[]): {
  firstNightOrder: NightStep[];
  otherNightsOrder: NightStep[];
} {
  const makeStep = (handler: string, p: Player): NightStep => ({
    handler,
    playerId: p.id,
    playerName: p.name,
    character: p.character!,
  });

  const resolve = (
    order: readonly string[],
    players: Player[]
  ): NightStep[] => {
    const steps: NightStep[] = [];
    for (const handler of order) {
      switch (handler) {
        case "minion_info":
          // One entry per minion
          players
            .filter((p) => p.characterRegistration === "minion")
            .forEach((p) => steps.push(makeStep("minion_info", p)));
          break;
        case "demon_info":
          // One entry per demon
          players
            .filter((p) => p.characterRegistration === "demon")
            .forEach((p) => steps.push(makeStep("demon_info", p)));
          break;
        case "imp":
          // Resolved dynamically at night-time (handles starpass)
          // Store a placeholder pointing to the current demon
          players
            .filter((p) => p.characterRegistration === "demon")
            .forEach((p) => steps.push(makeStep("imp", p)));
          break;
        default: {
          // Standard: find by character name
          const p = players.find((pl) => pl.character === handler);
          if (p) steps.push(makeStep(handler, p));
        }
      }
    }
    return steps;
  };

  return {
    firstNightOrder: resolve(FIRST_NIGHT_ORDER, players),
    otherNightsOrder: resolve(OTHER_NIGHT_ORDER, players),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Night step generation — filter the pre-computed order for this night
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate the concrete NightStep list for the current night.
 * Filters the pre-computed order for alive players and applies
 * any conditional rules (e.g. minion_info only with 7+ players).
 */
export function generateNightSteps(
  state: RoomState,
  serverGameState: ServerGameState
): NightStep[] {
  const nightNumber = state.roundNumber ?? 1;
  const template =
    nightNumber === 1
      ? serverGameState.firstNightOrder
      : serverGameState.otherNightsOrder;

  return template.filter((entry) => {
    // Conditional: minion_info and demon_info only with 7+ players
    if (
      (entry.handler === "minion_info" || entry.handler === "demon_info") &&
      state.players.length < 7
    ) {
      return false;
    }

    // Undertaker: only wakes on Night 2+ AND only if an execution happened today
    if (entry.handler === "undertaker") {
      if (nightNumber === 1) return false;
      if (!serverGameState.lastExecutedCharacter) return false;
    }

    // For "imp" handler, resolve the current demon (handles starpass)
    if (entry.handler === "imp") {
      return state.players.some(
        (p) => p.characterRegistration === "demon" && p.alive
      );
    }

    // Default: the player in the template must still be alive
    const player = state.players.find((p) => p.id === entry.playerId);
    return player?.alive ?? false;
  }).map((entry) => {
    // For "imp", resolve to whoever the current demon is
    if (entry.handler === "imp") {
      const demon = state.players.find(
        (p) => p.characterRegistration === "demon" && p.alive
      )!;
      return {
        handler: entry.handler,
        playerId: demon.id,
        playerName: demon.name,
        character: demon.character!,
      };
    }
    // For all others, refresh the player name (may have changed on reconnect)
    const player = state.players.find((p) => p.id === entry.playerId);
    return {
      ...entry,
      playerName: player?.name ?? entry.playerName,
    };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dispatch — route a step/action to the correct handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Dispatch to the correct handler when a player is woken up.
 * Returns `true` if a wake prompt was sent (player must respond),
 * or `false` if the handler was unknown / skipped.
 */
export async function dispatchNightStep(
  ctx: NightContext,
  step: NightStep,
  player: Player
): Promise<boolean> {
  switch (step.handler) {
    case "minion_info":
      await nightStep_minionInfo(ctx, step, player);
      return true;
    case "demon_info":
      await nightStep_demonInfo(ctx, step, player);
      return true;
    case "poisoner":
      await nightStep_poisoner(ctx, step, player);
      return true;
    case "washerwoman":
      await nightStep_washerwoman(ctx, step, player);
      return true;
    case "librarian":
      await nightStep_librarian(ctx, step, player);
      return true;
    case "investigator":
      await nightStep_investigator(ctx, step, player);
      return true;
    case "chef":
      await nightStep_chef(ctx, step, player);
      return true;
    case "empath":
      await nightStep_empath(ctx, step, player);
      return true;
    case "undertaker":
      await nightStep_undertaker(ctx, step, player);
      return true;
    case "fortune_teller":
      await nightStep_fortuneTeller(ctx, step, player);
      return true;
    case "butler":
      await nightStep_butler(ctx, step, player);
      return true;
    case "spy":
      await nightStep_spy(ctx, step, player);
      return true;
    case "monk":
      await nightStep_monk(ctx, step, player);
      return true;
    case "imp":
      await nightStep_imp(ctx, step, player);
      return true;
    default:
      console.log(`[NIGHT] Unknown handler "${step.handler}" — auto-skipping`);
      return false;
  }
}

/** Dispatch to the correct resolver when a player submits a night action. */
export async function dispatchNightAction(
  ctx: NightContext,
  step: NightStep,
  player: Player,
  action: NightAction
): Promise<void> {
  switch (step.handler) {
    case "poisoner":
      return resolveNight_poisoner(ctx, step, player, action);
    case "fortune_teller":
      return resolveNight_fortuneTeller(ctx, step, player, action);
    case "butler":
      return resolveNight_butler(ctx, step, player, action);
    case "monk":
      return resolveNight_monk(ctx, step, player, action);
    case "imp":
      return resolveNight_imp(ctx, step, player, action);
    default:
      // Shouldn't happen — fall through to sleep
      await ctx.sleepAndAdvance(step.playerId);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Step handlers — wake the player and send a prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Minion learns who the demon is (+ other minions). */
async function nightStep_minionInfo(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const demon = ctx.state.players.find(
    (p) => p.characterRegistration === "demon"
  );
  const otherMinions = ctx.state.players.filter(
    (p) => p.characterRegistration === "minion" && p.id !== step.playerId
  );

  const demonName = demon?.name ?? "unknown";
  const otherMinionNames = otherMinions.map((m) => m.name);

  let instruction = `The Demon is ${demonName}.`;
  if (otherMinionNames.length > 0) {
    instruction += ` Your fellow minion${otherMinionNames.length > 1 ? "s are" : " is"}: ${otherMinionNames.join(", ")}.`;
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "info",
      instruction,
      minionInfo: { demonName, otherMinionNames },
    },
  });

  await ctx.addLog("night:minionInfo", {
    minionName: player.name,
    minionCharacter: player.character,
    demonName: demon?.name,
    otherMinions: otherMinions.map((m) => m.name),
  });
}

/** Demon learns who their minions are + bluffs. */
async function nightStep_demonInfo(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const minions = ctx.state.players.filter(
    (p) => p.characterRegistration === "minion"
  );
  const minionNames = minions.map((m) => m.name).join(", ");
  const instruction = `Your minion${minions.length > 1 ? "s are" : " is"}: ${minionNames}.`;

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });
  ctx.sendToToken(step.playerId, {
    type: "demon:bluffs",
    bluffs: ctx.serverGameState.demonBluffs,
  });

  await ctx.addLog("night:demonInfo", {
    demonName: player.name,
    minions: minions.map((m) => ({ name: m.name, character: m.character })),
    bluffs: ctx.serverGameState.demonBluffs ?? [],
  });
}

/** Poisoner chooses a player to poison. */
async function nightStep_poisoner(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  // Poisoner may target anyone, including themselves and dead players
  const options = ctx.state.players.map((p) => p.id);

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "choose",
      instruction: "Choose a player to poison.",
      options,
      selectCount: 1,
    },
  });
  await ctx.setStepPhase("awaiting_action");
  await ctx.addLog("night:poisonerWake", {
    playerName: player.name,
    instruction: "Choose a player to poison.",
    options: idsToNames(options, ctx.state.players),
  });
}

/** Washerwoman: "One of [A] or [B] is the [Townsfolk]". */
async function nightStep_washerwoman(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const isDrunkOrPoisoned =
    player.states.includes("drunk") || player.states.includes("poisoned");
  let instruction: string;

  if (isDrunkOrPoisoned) {
    const others = shuffleArray(
      ctx.state.players.filter((p) => p.id !== step.playerId)
    );
    const allTownsfolk: Character[] = [
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "empath",
      "fortune_teller",
      "undertaker",
      "monk",
      "ravenkeeper",
      "virgin",
      "slayer",
      "soldier",
      "mayor",
    ];
    const rc = allTownsfolk[Math.floor(Math.random() * allTownsfolk.length)];
    instruction = `One of ${others[0]?.name} or ${others[1]?.name} is the ${charName(rc)}.`;
  } else {
    const townsfolk = ctx.state.players.filter(
      (p) =>
        p.id !== step.playerId &&
        p.characterRegistration === "townsfolk" &&
        p.alive
    );
    if (townsfolk.length === 0) {
      instruction = "No Townsfolk could be identified.";
    } else {
      const correct = townsfolk[Math.floor(Math.random() * townsfolk.length)];
      const wrongCandidates = ctx.state.players.filter(
        (p) => p.id !== step.playerId && p.id !== correct.id
      );
      const wrong =
        wrongCandidates[Math.floor(Math.random() * wrongCandidates.length)];
      const [a, b] =
        Math.random() < 0.5 ? [correct, wrong] : [wrong, correct];
      instruction = `One of ${a.name} or ${b.name} is the ${charName(correct.character!)}.`;
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });
  await ctx.addLog("night:washerwoman", {
    playerName: player.name,
    instruction,
    isDrunkOrPoisoned,
  });
}

/** Librarian: "One of [A] or [B] is the [Outsider]" or 0 result. */
async function nightStep_librarian(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const isDrunkOrPoisoned =
    player.states.includes("drunk") || player.states.includes("poisoned");
  let instruction: string;

  if (isDrunkOrPoisoned) {
    const others = shuffleArray(
      ctx.state.players.filter((p) => p.id !== step.playerId)
    );
    const allOutsiders: Character[] = ["butler", "drunk", "recluse", "saint"];
    const rc = allOutsiders[Math.floor(Math.random() * allOutsiders.length)];
    instruction = `One of ${others[0]?.name} or ${others[1]?.name} is the ${charName(rc)}.`;
  } else {
    const outsiders = ctx.state.players.filter(
      (p) =>
        p.id !== step.playerId &&
        p.characterRegistration === "outsider" &&
        p.alive
    );
    if (outsiders.length === 0) {
      instruction = "There are no Outsiders in play.";
    } else {
      const correct = outsiders[Math.floor(Math.random() * outsiders.length)];
      // The Drunk's .character is the townsfolk they think they are,
      // but the Librarian should see "Drunk" — use the true outsider identity.
      const displayChar: Character = correct.states.includes("drunk")
        ? "drunk"
        : correct.character!;
      const wrongCandidates = ctx.state.players.filter(
        (p) => p.id !== step.playerId && p.id !== correct.id
      );
      const wrong =
        wrongCandidates[Math.floor(Math.random() * wrongCandidates.length)];
      const [a, b] =
        Math.random() < 0.5 ? [correct, wrong] : [wrong, correct];
      instruction = `One of ${a.name} or ${b.name} is the ${charName(displayChar)}.`;
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });
  await ctx.addLog("night:librarian", {
    playerName: player.name,
    instruction,
    isDrunkOrPoisoned,
  });
}

/** Investigator: "One of [A] or [B] is the [Minion]". */
async function nightStep_investigator(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const isDrunkOrPoisoned =
    player.states.includes("drunk") || player.states.includes("poisoned");
  let instruction: string;

  if (isDrunkOrPoisoned) {
    const others = shuffleArray(
      ctx.state.players.filter((p) => p.id !== step.playerId)
    );
    const allMinions: Character[] = [
      "poisoner",
      "spy",
      "scarlet_woman",
      "baron",
    ];
    const rc = allMinions[Math.floor(Math.random() * allMinions.length)];
    instruction = `One of ${others[0]?.name} or ${others[1]?.name} is the ${charName(rc)}.`;
  } else {
    const minions = ctx.state.players.filter(
      (p) =>
        p.id !== step.playerId &&
        p.characterRegistration === "minion" &&
        p.alive
    );
    if (minions.length === 0) {
      instruction = "No Minions could be identified.";
    } else {
      const correct = minions[Math.floor(Math.random() * minions.length)];
      const wrongCandidates = ctx.state.players.filter(
        (p) =>
          p.id !== step.playerId && p.id !== correct.id && !isPlayerEvil(p)
      );
      const wrong =
        wrongCandidates.length > 0
          ? wrongCandidates[
              Math.floor(Math.random() * wrongCandidates.length)
            ]
          : ctx.state.players.filter(
              (p) => p.id !== step.playerId && p.id !== correct.id
            )[0];
      const [a, b] =
        Math.random() < 0.5 ? [correct, wrong] : [wrong, correct];
      instruction = `One of ${a.name} or ${b.name} is the ${charName(correct.character!)}.`;
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });
  await ctx.addLog("night:investigator", {
    playerName: player.name,
    instruction,
    isDrunkOrPoisoned,
  });
}

/** Chef: "There are [N] pairs of evil players sitting adjacent." */
async function nightStep_chef(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const isDrunkOrPoisoned =
    player.states.includes("drunk") || player.states.includes("poisoned");
  let count: number;

  if (isDrunkOrPoisoned) {
    count = Math.floor(Math.random() * 3); // 0, 1, or 2
  } else {
    count = 0;
    const seating = ctx.state.seatingOrder ?? [];
    for (let i = 0; i < seating.length; i++) {
      const a = ctx.state.players.find((p) => p.id === seating[i]);
      const b = ctx.state.players.find(
        (p) => p.id === seating[(i + 1) % seating.length]
      );
      if (a && b && isPlayerEvil(a) && isPlayerEvil(b)) {
        count++;
      }
    }
  }

  const instruction =
    count === 0
      ? "There are no pairs of evil players sitting adjacent to each other."
      : `There ${count === 1 ? "is 1 pair" : `are ${count} pairs`} of evil players sitting adjacent to each other.`;

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });
  await ctx.addLog("night:chef", {
    playerName: player.name,
    instruction,
    count,
    isDrunkOrPoisoned,
  });
}

/** Empath: "[0/1/2] of your alive neighbors are evil." */
async function nightStep_empath(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const isDrunkOrPoisoned =
    player.states.includes("drunk") || player.states.includes("poisoned");
  let count: number;

  if (isDrunkOrPoisoned) {
    count = Math.floor(Math.random() * 3);
  } else {
    const neighbors = getAliveNeighbors(
      step.playerId,
      ctx.state.players,
      ctx.state.seatingOrder ?? []
    );
    count = neighbors.filter((n) => isPlayerEvil(n)).length;
  }

  const instruction =
    count === 0
      ? "Neither of your alive neighbors are evil."
      : `${count} of your alive neighbor${count > 1 ? "s are" : " is"} evil.`;

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });
  await ctx.addLog("night:empath", {
    playerName: player.name,
    instruction,
    count,
    isDrunkOrPoisoned,
  });
}

/** Undertaker: each night* after an execution, learns the character of who was executed. */
async function nightStep_undertaker(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const isDrunkOrPoisoned =
    player.states.includes("drunk") || player.states.includes("poisoned");
  let instruction: string;

  if (isDrunkOrPoisoned) {
    // Show a random character as false info
    const allChars: Character[] = [
      "washerwoman", "librarian", "investigator", "chef", "empath",
      "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
      "slayer", "soldier", "mayor", "butler", "recluse", "saint",
      "baron", "spy", "poisoner", "imp",
    ];
    const fakeChar = allChars[Math.floor(Math.random() * allChars.length)];
    instruction = `The executed player was the ${charName(fakeChar)}.`;
  } else {
    const executedChar = ctx.serverGameState.lastExecutedCharacter;
    if (executedChar) {
      instruction = `The executed player was the ${charName(executedChar)}.`;
    } else {
      instruction = "No one was executed today.";
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });
  await ctx.addLog("night:undertaker", {
    playerName: player.name,
    instruction,
    isDrunkOrPoisoned,
  });
}

/** Fortune Teller: choose 2 players → learns yes/no if the Demon is among them. */
async function nightStep_fortuneTeller(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  // Fortune Teller may include themselves and dead players in the 2 chosen players
  const options = ctx.state.players.map((p) => p.id);

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "choose",
      instruction: "Choose 2 players to divine.",
      options,
      selectCount: 2,
    },
  });
  await ctx.setStepPhase("awaiting_action");
  await ctx.addLog("night:fortuneTellerWake", {
    playerName: player.name,
    instruction: "Choose 2 players to divine.",
    options: idsToNames(options, ctx.state.players),
  });
}

/** Butler: choose a master (may only vote when they vote). */
async function nightStep_butler(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  // Butler may choose any player (alive or dead), but not themselves
  const options = ctx.state.players
    .filter((p) => p.id !== step.playerId)
    .map((p) => p.id);

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "choose",
      instruction:
        "Choose a player to be your master. You may only vote when they vote.",
      options,
      selectCount: 1,
    },
  });
  await ctx.setStepPhase("awaiting_action");
  await ctx.addLog("night:butlerWake", {
    playerName: player.name,
    instruction: "Choose a player to be your master.",
    options: idsToNames(options, ctx.state.players),
  });
}

/** Spy: sees the entire grimoire. */
async function nightStep_spy(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const isDrunkOrPoisoned =
    player.states.includes("drunk") || player.states.includes("poisoned");

  if (isDrunkOrPoisoned) {
    ctx.sendToToken(step.playerId, {
      type: "player:wake",
      prompt: {
        character: player.character!,
        promptType: "info",
        instruction: "Your ability is not working tonight.",
      },
    });
    await ctx.addLog("night:spy", {
      playerName: player.name,
      instruction: "Your ability is not working tonight.",
      isDrunkOrPoisoned: true,
    });
    return;
  }

  // Build structured grimoire entries in seating order
  const seating = ctx.state.seatingOrder ?? ctx.state.players.map((p) => p.id);
  const grimoire: GrimoireEntry[] = seating
    .map((id) => ctx.state.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => ({
      playerId: p.id,
      playerName: p.name,
      character: p.character!,
      characterType: p.characterRegistration ?? p.characterType!,
      states: [...p.states],
      alive: p.alive,
    }));

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "grimoire",
      instruction: "You see the Grimoire.",
      grimoire,
    },
  });

  const textLines = grimoire.map(
    (e) =>
      `• ${e.playerName}: ${charName(e.character)} (${e.characterType})${e.states.length ? " [" + e.states.join(", ") + "]" : ""}`
  );
  await ctx.addLog("night:spy", {
    playerName: player.name,
    instruction: "Grimoire:\n" + textLines.join("\n"),
    isDrunkOrPoisoned: false,
  });
}

/** Monk: choose a player to protect from the Demon tonight. */
async function nightStep_monk(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  // Monk may protect any player (alive or dead), but not themselves
  const options = ctx.state.players
    .filter((p) => p.id !== step.playerId)
    .map((p) => p.id);

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "choose",
      instruction: "Choose a player to protect from the Demon tonight.",
      options,
      selectCount: 1,
    },
  });
  await ctx.setStepPhase("awaiting_action");
  await ctx.addLog("night:monkWake", {
    playerName: player.name,
    instruction: "Choose a player to protect from the Demon tonight.",
    options: idsToNames(options, ctx.state.players),
  });
}

/** Imp: choose someone to kill tonight (may choose self → starpass). */
async function nightStep_imp(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  const options = ctx.state.players.filter((p) => p.alive).map((p) => p.id);

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "choose",
      instruction: "Choose a player to kill tonight.",
      options,
      selectCount: 1,
    },
  });
  await ctx.setStepPhase("awaiting_action");
  await ctx.addLog("night:impWake", {
    playerName: player.name,
    instruction: "Choose a player to kill tonight.",
    options: idsToNames(options, ctx.state.players),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Resolvers — process a player's choice after a "choose" prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Poisoner chose a target → apply poisoned state. */
async function resolveNight_poisoner(
  ctx: NightContext,
  step: NightStep,
  player: Player,
  action: NightAction
) {
  if (action.action === "choose" && action.targetIds.length === 1) {
    // Clear previous poison
    for (const p of ctx.state.players) {
      p.states = p.states.filter((s) => s !== "poisoned");
    }
    const target = ctx.state.players.find(
      (p) => p.id === action.targetIds[0]
    );
    const effective =
      !player.states.includes("drunk") && !player.states.includes("poisoned");
    if (target && effective) {
      target.states.push("poisoned");
    }
    await ctx.persistState();
    await ctx.addLog("night:poisonerAction", {
      playerName: player.name,
      targetName: target?.name ?? "unknown",
      effective,
    });
  }
  await ctx.sleepAndAdvance(step.playerId);
}

/** Fortune Teller chose 2 → show yes/no result, then wait for acknowledge. */
async function resolveNight_fortuneTeller(
  ctx: NightContext,
  step: NightStep,
  player: Player,
  action: NightAction
) {
  if (action.action === "choose" && action.targetIds.length === 2) {
    const isDrunkOrPoisoned =
      player.states.includes("drunk") || player.states.includes("poisoned");
    let result: boolean;

    if (isDrunkOrPoisoned) {
      result = Math.random() < 0.5;
    } else {
      const isDemon = action.targetIds.some((id) => {
        const t = ctx.state.players.find((p) => p.id === id);
        return t?.characterRegistration === "demon";
      });
      const isRedHerring = action.targetIds.includes(
        ctx.serverGameState.fortuneTellerRedHerring ?? ""
      );
      result = isDemon || isRedHerring;
    }

    // Send a new wake prompt with the result — player must acknowledge
    ctx.sendToToken(step.playerId, {
      type: "player:wake",
      prompt: {
        character: player.character!,
        promptType: "info",
        instruction: result
          ? "Yes — one of them is the Demon."
          : "No — neither of them is the Demon.",
      },
    });

    await ctx.setStepPhase("awaiting_acknowledge");

    const resultInstruction = result
      ? "Yes — one of them is the Demon."
      : "No — neither of them is the Demon.";
    await ctx.addLog("night:fortuneTellerResult", {
      playerName: player.name,
      targets: idsToNames(action.targetIds, ctx.state.players),
      result,
      instruction: resultInstruction,
      isDrunkOrPoisoned,
    });
    // Don't advance — wait for player to acknowledge the result
    return;
  }
  await ctx.sleepAndAdvance(step.playerId);
}

/** Butler chose a master. */
async function resolveNight_butler(
  ctx: NightContext,
  step: NightStep,
  player: Player,
  action: NightAction
) {
  if (action.action === "choose" && action.targetIds.length === 1) {
    const master = ctx.state.players.find(
      (p) => p.id === action.targetIds[0]
    );
    if (!ctx.serverGameState.butlerMasters) {
      ctx.serverGameState.butlerMasters = {};
    }
    ctx.serverGameState.butlerMasters[step.playerId] = action.targetIds[0];
    await ctx.persistServerState();
    await ctx.addLog("night:butlerAction", {
      butlerName: player.name,
      masterName: master?.name ?? "unknown",
    });
  }
  await ctx.sleepAndAdvance(step.playerId);
}

/** Monk chose a player to protect. */
async function resolveNight_monk(
  ctx: NightContext,
  step: NightStep,
  player: Player,
  action: NightAction
) {
  if (action.action === "choose" && action.targetIds.length === 1) {
    const target = ctx.state.players.find(
      (p) => p.id === action.targetIds[0]
    );
    const effective =
      !player.states.includes("drunk") && !player.states.includes("poisoned");
    if (target && effective) {
      if (!target.states.includes("protected")) {
        target.states.push("protected");
      }
    }
    await ctx.persistState();
    await ctx.addLog("night:monkAction", {
      playerName: player.name,
      targetName: target?.name ?? "unknown",
      effective,
    });
  }
  await ctx.sleepAndAdvance(step.playerId);
}

/** Imp chose someone to kill (or self → starpass, or nobody → no kill). */
async function resolveNight_imp(
  ctx: NightContext,
  step: NightStep,
  player: Player,
  action: NightAction
) {
  if (action.action === "none") {
    await ctx.addLog("night:impSkip", { playerName: player.name });
    await ctx.sleepAndAdvance(step.playerId);
    return;
  }

  if (action.action === "choose" && action.targetIds.length === 1) {
    const targetId = action.targetIds[0];

    if (targetId === step.playerId) {
      // ── Starpass: Imp kills themselves → random alive minion becomes Imp ──
      const aliveMinions = ctx.state.players.filter(
        (p) => p.characterRegistration === "minion" && p.alive
      );
      if (aliveMinions.length > 0) {
        const newImp =
          aliveMinions[Math.floor(Math.random() * aliveMinions.length)];
        newImp.character = "imp";
        newImp.characterType = "demon";
        newImp.characterRegistration = "demon";
        player.alive = false;
        if (!ctx.serverGameState.nightDeaths) ctx.serverGameState.nightDeaths = [];
        ctx.serverGameState.nightDeaths.push(player.name);
        await ctx.persistState();
        ctx.sendToToken(newImp.id, {
          type: "character:reveal",
          character: "imp",
          characterType: "demon",
        });
        await ctx.addLog("night:impStarpass", {
          impName: player.name,
          newImpName: newImp.name,
        });
      } else {
        // No minions alive — Imp just dies
        player.alive = false;
        if (!ctx.serverGameState.nightDeaths) ctx.serverGameState.nightDeaths = [];
        ctx.serverGameState.nightDeaths.push(player.name);
        await ctx.persistState();
        await ctx.addLog("night:impSuicide", { impName: player.name });
      }
    } else {
      // ── Normal kill — resolved immediately so later steps see the correct alive state ──
      const target = ctx.state.players.find((p) => p.id === targetId);
      await ctx.addLog("night:impKill", {
        playerName: player.name,
        targetName: target?.name ?? "unknown",
      });

      if (target && target.alive) {
        const isProtected = target.states.includes("protected");
        const isSoldier =
          target.character === "soldier" &&
          !target.states.includes("drunk") &&
          !target.states.includes("poisoned");

        if (isProtected || isSoldier) {
          await ctx.addLog("night:killPrevented", {
            targetName: target.name,
            reason: isProtected ? "protected" : "soldier",
          });
        } else {
          target.alive = false;
          if (!ctx.serverGameState.nightDeaths) ctx.serverGameState.nightDeaths = [];
          ctx.serverGameState.nightDeaths.push(target.name);
          await ctx.addLog("night:playerDied", { targetName: target.name });
          await ctx.persistState();
        }
      }
      await ctx.persistServerState();
    }
  }
  await ctx.sleepAndAdvance(step.playerId);
}
