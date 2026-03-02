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
import type { StoryLogger } from "./storyLogger";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Context interface — provided by RoomServer at call-time
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NightContext {
  /** Full room state (players, seating, phase, etc.) */
  state: RoomState;
  /** Server-only state (bluffs, red herring, pending kills, etc.) */
  serverGameState: ServerGameState;
  /** Story logger for clean narrative events. */
  storyLogger: StoryLogger;
  /** Send a WebSocket message to a player by their stable token. */
  sendToToken(token: string, message: ServerMessage): void;
  /** Append to the persistent game log (debug). */
  addLog(event: string, detail: Record<string, unknown>): Promise<void>;
  /**
   * Log to BOTH debug log and story log.
   * Use this for player actions and information shown.
   */
  logBoth(debugEvent: string, debugDetail: Record<string, unknown>, storyDetail: Record<string, unknown>): Promise<void>;
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

/**
 * Is the player evil by registration?
 * Uses characterRegistration which is set at game start and accounts for Recluse.
 */
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
// Night order — simple character-based system
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get the night order for the current night.
 * Returns a simple array of handler strings (character names + special handlers).
 * The handlers are resolved dynamically at execution time.
 */
export function getNightOrder(nightNumber: number): readonly string[] {
  return nightNumber === 1 ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
}

/**
 * Resolve a handler to the player(s) who should wake for it.
 * Returns null if the handler should be skipped this night.
 * Returns an array because minion_info/demon_info can apply to multiple players.
 */
export function resolveHandler(
  handler: string,
  state: RoomState,
  serverGameState: ServerGameState
): Player[] | null {
  const nightNumber = state.roundNumber ?? 1;

  // Skip minion/demon info for < 7 players
  if (
    (handler === "minion_info" || handler === "demon_info") &&
    state.players.length < 7
  ) {
    return null;
  }

  // Minion info: all alive minions (by characterType, not registration)
  if (handler === "minion_info") {
    const minions = state.players.filter(
      (p) => p.characterType === "minion" && p.alive
    );
    return minions.length > 0 ? minions : null;
  }

  // Demon info: all alive demons (by characterType, not registration)
  if (handler === "demon_info") {
    const demons = state.players.filter(
      (p) => p.characterType === "demon" && p.alive
    );
    return demons.length > 0 ? demons : null;
  }

  // Imp: whoever's character is imp and is alive (handles starpass)
  if (handler === "imp") {
    const demon = state.players.find(
      (p) => p.character === "imp" && p.alive
    );
    return demon ? [demon] : null;
  }

  // Ravenkeeper: only if they died tonight
  if (handler === "ravenkeeper") {
    const ravenkeepers = state.players.filter(
      (p) =>
        p.character === "ravenkeeper" &&
        serverGameState.nightDeaths?.includes(p.name)
    );
    return ravenkeepers.length > 0 ? ravenkeepers : null;
  }

  // Undertaker: only on Night 2+ AND only if someone was executed
  if (handler === "undertaker") {
    if (nightNumber === 1 || !serverGameState.lastExecutedCharacter) {
      return null;
    }
    const undertaker = state.players.find(
      (p) => p.character === "undertaker" && p.alive
    );
    return undertaker ? [undertaker] : null;
  }

  // Default: find alive player with this character
  const player = state.players.find(
    (p) => p.character === handler && p.alive
  );
  return player ? [player] : null;
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
  handler: string,
  player: Player
): Promise<boolean> {
  // Create a minimal NightStep for backwards compatibility with existing handlers
  const step = {
    handler,
    playerId: player.id,
    playerName: player.name,
    character: player.character!,
  };

  switch (handler) {
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
    case "ravenkeeper":
      await nightStep_ravenkeeper(ctx, step, player);
      return true;
    default:
      console.log(`[NIGHT] Unknown handler "${handler}" — auto-skipping`);
      return false;
  }
}

/** Dispatch to the correct resolver when a player submits a night action. */
export async function dispatchNightAction(
  ctx: NightContext,
  handler: string,
  player: Player,
  action: NightAction
): Promise<void> {
  // Create a minimal NightStep for backwards compatibility with existing handlers
  const step = {
    handler,
    playerId: player.id,
    playerName: player.name,
    character: player.character!,
  };

  switch (handler) {
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
    case "ravenkeeper":
      return resolveNight_ravenkeeper(ctx, step, player, action);
    default:
      // Shouldn't happen — fall through to sleep
      await ctx.sleepAndAdvance(player.id);
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
  // Use characterType to find actual demons (not Recluse who registers as demon)
  const demon = ctx.state.players.find(
    (p) => p.characterType === "demon"
  );
  const otherMinions = ctx.state.players.filter(
    (p) => p.characterType === "minion" && p.id !== step.playerId
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


  await ctx.storyLogger.addEvent("night:minionInfo", {
    minionName: player.name,
    minionCharacter: player.character,
    demonName: demon?.name ?? "unknown",
    otherMinions: otherMinions.map((m) => m.name),
  });
}

/** Demon learns who their minions are + bluffs. */
async function nightStep_demonInfo(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  // Use characterType to find actual minions (not Recluse who registers as minion)
  const minions = ctx.state.players.filter(
    (p) => p.characterType === "minion"
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


  await ctx.storyLogger.addEvent("night:demonInfo", {
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
      // For Recluse registering as townsfolk, show a random townsfolk character
      const displayChar: Character =
        correct.trueCharacter === "recluse"
          ? (["washerwoman", "librarian", "investigator", "chef", "empath",
              "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
              "slayer", "soldier", "mayor"][Math.floor(Math.random() * 13)] as Character)
          : correct.trueCharacter!;
      const wrongCandidates = ctx.state.players.filter(
        (p) => p.id !== step.playerId && p.id !== correct.id
      );
      const wrong =
        wrongCandidates[Math.floor(Math.random() * wrongCandidates.length)];
      const [a, b] =
        Math.random() < 0.5 ? [correct, wrong] : [wrong, correct];
      instruction = `One of ${a.name} or ${b.name} is the ${charName(displayChar)}.`;

      // Track reminder tokens for Spy grimoire
      ctx.serverGameState.washerwomanTownsfolk = correct.id;
      ctx.serverGameState.washerwomanWrong = wrong.id;
      await ctx.persistServerState();
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });

  await ctx.storyLogger.logPlayerInfo({
    playerName: player.name,
    character: "washerwoman",
    states: player.states.filter(s => s === "drunk" || s === "poisoned"),
    infoShown: instruction,
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
      // Determine display character:
      // - Drunk: show "drunk" (their true character)
      // - Recluse: show random outsider (butler, drunk, saint)
      // - Others: show their true character
      let displayChar: Character;
      if (correct.states.includes("drunk")) {
        displayChar = "drunk";
      } else if (correct.trueCharacter === "recluse") {
        displayChar = (["butler", "drunk", "saint"][Math.floor(Math.random() * 3)] as Character);
      } else {
        displayChar = correct.trueCharacter!;
      }
      const wrongCandidates = ctx.state.players.filter(
        (p) => p.id !== step.playerId && p.id !== correct.id
      );
      const wrong =
        wrongCandidates[Math.floor(Math.random() * wrongCandidates.length)];
      const [a, b] =
        Math.random() < 0.5 ? [correct, wrong] : [wrong, correct];
      instruction = `One of ${a.name} or ${b.name} is the ${charName(displayChar)}.`;

      // Track reminder tokens for Spy grimoire
      ctx.serverGameState.librarianOutsider = correct.id;
      ctx.serverGameState.librarianWrong = wrong.id;
      await ctx.persistServerState();
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });

  await ctx.storyLogger.logPlayerInfo({
    playerName: player.name,
    character: "librarian",
    states: player.states.filter(s => s === "drunk" || s === "poisoned"),
    infoShown: instruction,
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
    // Find players who register as minion (Recluse may register as minion)
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
      // For display: if Recluse registering as minion, show a random minion character
      const displayChar: Character =
        correct.trueCharacter === "recluse"
          ? (["poisoner", "spy", "scarlet_woman", "baron"][
              Math.floor(Math.random() * 4)
            ] as Character)
          : correct.trueCharacter!;
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
      instruction = `One of ${a.name} or ${b.name} is the ${charName(displayChar)}.`;

      // Track reminder tokens for Spy grimoire
      ctx.serverGameState.investigatorMinion = correct.id;
      ctx.serverGameState.investigatorWrong = wrong.id;
      await ctx.persistServerState();
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });

  await ctx.storyLogger.logPlayerInfo({
    playerName: player.name,
    character: "investigator",
    states: player.states.filter(s => s === "drunk" || s === "poisoned"),
    infoShown: instruction,
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
      // isPlayerEvil uses characterRegistration (accounts for Recluse)
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

  await ctx.storyLogger.logPlayerInfo({
    playerName: player.name,
    character: "chef",
    states: player.states.filter(s => s === "drunk" || s === "poisoned"),
    infoShown: instruction,
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
    // isPlayerEvil uses characterRegistration (Recluse registers as minion or demon at game start)
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

  await ctx.storyLogger.logPlayerInfo({
    playerName: player.name,
    character: "empath",
    states: player.states.filter(s => s === "drunk" || s === "poisoned"),
    infoShown: instruction,
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
      // For Recluse, show a random character matching their registration
      let displayChar: Character = executedChar;
      if (executedChar === "recluse") {
        const registration = ctx.serverGameState.lastExecutedRegistration;
        if (registration === "outsider") {
          displayChar = (["butler", "drunk", "saint"][Math.floor(Math.random() * 3)] as Character);
        } else if (registration === "minion") {
          displayChar = (["poisoner", "spy", "scarlet_woman", "baron"][Math.floor(Math.random() * 4)] as Character);
        } else if (registration === "demon") {
          displayChar = "imp";
        }
      }
      instruction = `The executed player was the ${charName(displayChar)}.`;
    } else {
      instruction = "No one was executed today.";
    }
  }

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: { character: player.character!, promptType: "info", instruction },
  });

  await ctx.storyLogger.logPlayerInfo({
    playerName: player.name,
    character: "undertaker",
    states: player.states.filter(s => s === "drunk" || s === "poisoned"),
    infoShown: instruction,
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
    return;
  }

  // Build structured grimoire entries in seating order
  const grimoire = buildSpyGrimoire(ctx.state, ctx.serverGameState);

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

  await ctx.storyLogger.addEvent("night:spyGrimoire", {
    playerName: player.name,
    grimoire: grimoire.map(e => ({
      playerName: e.playerName,
      character: e.character,
      alive: e.alive,
      states: e.states,
    })),
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
}

/** Ravenkeeper: if killed tonight, choose a player to learn their character. */
async function nightStep_ravenkeeper(
  ctx: NightContext,
  step: NightStep,
  player: Player
) {
  // Ravenkeeper can choose any player (alive or dead)
  const options = ctx.state.players.map((p) => p.id);

  ctx.sendToToken(step.playerId, {
    type: "player:wake",
    prompt: {
      character: player.character!,
      promptType: "choose",
      instruction: "You died tonight. Choose a player to learn their character.",
      options,
      selectCount: 1,
    },
  });
  await ctx.setStepPhase("awaiting_action");
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
    if (target && effective) {
      await ctx.storyLogger.logNightPoison(player.name, target.name);
    }
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
      // Check characterRegistration (Recluse may register as demon at game start)
      const isDemon = action.targetIds.some((id) => {
        const t = ctx.state.players.find((p) => p.id === id);
        return t && t.characterRegistration === "demon";
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

    await ctx.storyLogger.logPlayerInfo({
      playerName: player.name,
      character: "fortune_teller",
      states: player.states.filter(s => s === "drunk" || s === "poisoned"),
      infoShown: `${idsToNames(action.targetIds, ctx.state.players).join(" and ")}: ${resultInstruction}`,
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

    await ctx.storyLogger.logPlayerAction({
      playerName: player.name,
      character: "butler",
      states: player.states.filter(s => s === "drunk" || s === "poisoned"),
      action: `chose ${master?.name ?? "unknown"} as master`,
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
    if (target) {
      if (effective) {
        await ctx.storyLogger.logNightProtection(player.name, target.name);
      } else {
        // Log when Monk tries to protect while drunk/poisoned
        await ctx.storyLogger.logPlayerAction({
          playerName: player.name,
          character: "monk",
          states: player.states.filter(s => s === "drunk" || s === "poisoned"),
          action: `tried to protect ${target.name}`,
          result: "failed (drunk/poisoned)"
        });
      }
    }
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
    // Imp chose no kill
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
        // Update minion to become Imp - change their character, type, and registration
        newImp.character = "imp";
        newImp.characterType = "demon";
        newImp.characterRegistration = "demon";

        // Kill the old Imp
        player.alive = false;
        if (!ctx.serverGameState.nightDeaths) ctx.serverGameState.nightDeaths = [];
        ctx.serverGameState.nightDeaths.push(player.name);
        await ctx.persistState();

        // Reveal new character to the new Imp
        ctx.sendToToken(newImp.id, {
          type: "character:reveal",
          character: "imp",
          characterType: "demon",
        });

        await ctx.storyLogger.logStarpass(player.name, newImp.name);
      } else {
        // No minions alive — Imp just dies
        player.alive = false;
        if (!ctx.serverGameState.nightDeaths) ctx.serverGameState.nightDeaths = [];
        ctx.serverGameState.nightDeaths.push(player.name);
        await ctx.persistState();
      }
    } else {
      // ── Normal kill — resolved immediately so later steps see the correct alive state ──
      let target = ctx.state.players.find((p) => p.id === targetId);

      if (target && target.alive) {
        const isProtected = target.states.includes("protected");
        const isSoldier =
          target.character === "soldier" &&
          !target.states.includes("drunk") &&
          !target.states.includes("poisoned");

        // Check for Mayor bounce
        const isMayor =
          target.character === "mayor" &&
          !target.states.includes("drunk") &&
          !target.states.includes("poisoned");

        if (isProtected || isSoldier) {
          await ctx.storyLogger.logNightKill({
            killerName: player.name,
            targetName: target.name,
            protected: isProtected,
            soldier: isSoldier,
            actuallyDied: false,
          });
        } else if (isMayor) {
          // Mayor bounce: kill bounces to another alive player
          const otherAlivePlayers = ctx.state.players.filter(
            (p) => p.alive && p.id !== target!.id && p.id !== player.id
          );
          if (otherAlivePlayers.length > 0) {
            const bounceTarget = otherAlivePlayers[Math.floor(Math.random() * otherAlivePlayers.length)];
            bounceTarget.alive = false;
            if (!ctx.serverGameState.nightDeaths) ctx.serverGameState.nightDeaths = [];
            ctx.serverGameState.nightDeaths.push(bounceTarget.name);
            await ctx.persistState();

            await ctx.storyLogger.logNightKill({
              killerName: player.name,
              targetName: target.name,
              mayorBounce: true,
              bouncedTo: bounceTarget.name,
              actuallyDied: true,
            });
          } else {
            // No one to bounce to — Mayor survives
            await ctx.storyLogger.logNightKill({
              killerName: player.name,
              targetName: target.name,
              mayorBounce: true,
              actuallyDied: false,
            });
          }
        } else {
          target.alive = false;
          if (!ctx.serverGameState.nightDeaths) ctx.serverGameState.nightDeaths = [];
          ctx.serverGameState.nightDeaths.push(target.name);
          await ctx.persistState();

          await ctx.storyLogger.logNightKill({
            killerName: player.name,
            targetName: target.name,
            protected: false,
            soldier: false,
            actuallyDied: true,
          });
        }
      }
      await ctx.persistServerState();
    }
  }
  await ctx.sleepAndAdvance(step.playerId);
}

/** Ravenkeeper chose a player → learn their character. */
async function resolveNight_ravenkeeper(
  ctx: NightContext,
  step: NightStep,
  player: Player,
  action: NightAction
) {
  if (action.action === "choose" && action.targetIds.length === 1) {
    const target = ctx.state.players.find(
      (p) => p.id === action.targetIds[0]
    );

    if (target) {
      // Check if Ravenkeeper was drunk/poisoned when they died
      const isDrunkOrPoisoned =
        player.states.includes("drunk") || player.states.includes("poisoned");

      let revealedChar: Character = target.character!;

      if (isDrunkOrPoisoned) {
        // Show a random character as false info
        const allChars: Character[] = [
          "washerwoman", "librarian", "investigator", "chef", "empath",
          "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
          "slayer", "soldier", "mayor", "butler", "recluse", "saint",
          "baron", "spy", "poisoner", "scarlet_woman", "imp",
        ];
        revealedChar = allChars[Math.floor(Math.random() * allChars.length)];
      } else {
        // For Recluse, show a random character matching their registration
        if (target.trueCharacter === "recluse") {
          const registration = target.characterRegistration;
          if (registration === "outsider") {
            const outsiders: Character[] = ["butler", "drunk", "saint"];
            revealedChar = outsiders[Math.floor(Math.random() * outsiders.length)];
          } else if (registration === "minion") {
            const minions: Character[] = ["poisoner", "spy", "scarlet_woman", "baron"];
            revealedChar = minions[Math.floor(Math.random() * minions.length)];
          } else if (registration === "demon") {
            revealedChar = "imp";
          }
        } else {
          // For non-Recluse, show their true character
          revealedChar = target.trueCharacter ?? target.character!;
        }
      }

      const instruction = `${target.name} is the ${charName(revealedChar)}.`;

      // Log the Ravenkeeper's choice and the information they received
      await ctx.storyLogger.logNightRavenkeeper({
        ravenkeeperName: player.name,
        targetName: target.name,
        revealedCharacter: revealedChar,
        actualCharacter: target.trueCharacter ?? target.character!,
        wasCorrect: !isDrunkOrPoisoned,
      });

      // Send result to Ravenkeeper
      ctx.sendToToken(step.playerId, {
        type: "player:wake",
        prompt: {
          character: player.character!,
          promptType: "info",
          instruction,
        },
      });

      await ctx.setStepPhase("awaiting_acknowledge");
      return; // Don't advance — wait for player to acknowledge
    }
  }
  await ctx.sleepAndAdvance(step.playerId);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Grimoire builder — used by Spy and for end-of-game display
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build structured grimoire entries in seating order with all reminder tokens.
 * This is shown to the Spy during the game and to the host at game end.
 */
export function buildSpyGrimoire(
  state: RoomState,
  serverGameState: ServerGameState
): GrimoireEntry[] {
  const seating = state.seatingOrder ?? state.players.map((p) => p.id);
  return seating
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => {
      const reminderTokens: string[] = [];

      // Butler master
      const isButlerMaster = Object.values(serverGameState.butlerMasters ?? {}).includes(p.id);
      if (isButlerMaster) reminderTokens.push("butler-master");

      // Protected (Monk)
      if (p.states.includes("protected")) reminderTokens.push("protected");

      // Poisoned (Poisoner)
      if (p.states.includes("poisoned")) reminderTokens.push("poisoned");

      // Drunk (actual drunk, not drunk/poisoned state)
      if (p.trueCharacter === "drunk") reminderTokens.push("drunk");

      // Died today (executed yesterday)
      if (serverGameState.lastExecutedPlayerId === p.id) {
        reminderTokens.push("died-today");
      }

      // Imp dead (dead imp)
      if (p.trueCharacter === "imp" && !p.alive) {
        reminderTokens.push("imp-dead");
      }

      // Investigator tokens
      if (serverGameState.investigatorMinion === p.id) {
        reminderTokens.push("investigator-minion");
      }
      if (serverGameState.investigatorWrong === p.id) {
        reminderTokens.push("investigator-wrong");
      }

      // Librarian tokens
      if (serverGameState.librarianOutsider === p.id) {
        reminderTokens.push("librarian-outsider");
      }
      if (serverGameState.librarianWrong === p.id) {
        reminderTokens.push("librarian-wrong");
      }

      // Washerwoman tokens
      if (serverGameState.washerwomanTownsfolk === p.id) {
        reminderTokens.push("washerwoman-townsfolk");
      }
      if (serverGameState.washerwomanWrong === p.id) {
        reminderTokens.push("washerwoman-wrong");
      }

      // Fortune Teller red herring
      if (serverGameState.fortuneTellerRedHerring === p.id) {
        reminderTokens.push("red-herring");
      }

      // Scarlet Woman is now Imp
      if (p.trueCharacter === "imp" && p.character === "imp" && p.alive) {
        // Check if they were originally scarlet_woman (this is tricky - we'd need to track original character)
        // For now, skip this one - would need additional state tracking
      }

      // Slayer no ability
      if (p.character === "slayer" && !p.ability) {
        reminderTokens.push("slayer-no-ability");
      }

      // Virgin no ability
      if (p.character === "virgin" && !p.ability) {
        reminderTokens.push("virgin-no-ability");
      }

      return {
        playerId: p.id,
        playerName: p.name,
        character: p.character!,
        characterType: p.characterRegistration ?? p.characterType!,
        states: [...p.states],
        alive: p.alive,
        reminderTokens: reminderTokens as any,
      };
    });
}
