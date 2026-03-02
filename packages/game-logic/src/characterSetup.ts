/**
 * Character setup orchestration.
 *
 * Runs all character setup functions and applies state updates.
 * Provides deterministic random for testing.
 */

import type {
  Player,
  RoomState,
  ServerGameState,
  SetupContext,
  SetupResult,
} from "./types/index";
import { getCharactersWithSetup } from "./characterDefinitions";

/**
 * Deterministic random number generator (for testing).
 * Uses a simple LCG (Linear Congruential Generator).
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Returns a pseudo-random number in [0, 1).
   */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.seed = (this.seed * 1664525 + 1013904223) % 2 ** 32;
    return this.seed / 2 ** 32;
  }

  /**
   * Returns a random integer in [0, max).
   */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /**
   * Shuffle an array in place using Fisher-Yates.
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

/**
 * Run all character setup functions and apply state updates.
 *
 * @param players - Current player list
 * @param serverGameState - Current server state
 * @param roomState - Current room state
 * @param seed - Optional seed for deterministic random (testing only)
 * @returns Updated state objects
 */
export function runCharacterSetup(
  players: Player[],
  serverGameState: ServerGameState,
  roomState: RoomState,
  seed?: number
): {
  players: Player[];
  serverGameState: ServerGameState;
  roomState: RoomState;
} {
  // Create random function (deterministic if seed provided)
  const rng = seed !== undefined ? new SeededRandom(seed) : null;
  const random = rng ? () => rng.next() : Math.random;

  // Deep clone state to avoid mutations
  const updatedPlayers = players.map((p) => ({ ...p, states: [...p.states] }));
  const updatedServerState = { ...serverGameState };
  const updatedRoomState = { ...roomState };

  // Build context
  const ctx: SetupContext = {
    players: updatedPlayers,
    serverGameState: updatedServerState,
    roomState: updatedRoomState,
    random,
  };

  // Get all characters with setup functions
  const setupChars = getCharactersWithSetup();

  // Find players with those characters and run setup
  for (const player of updatedPlayers) {
    if (!player.character) continue;

    const setupDef = setupChars.find((def) => def.character === player.character);
    if (!setupDef?.setup) continue;

    // Run setup function
    const result: SetupResult = setupDef.setup(ctx);

    // Apply player updates
    if (result.playerUpdates) {
      for (const [playerId, updates] of result.playerUpdates) {
        const target = updatedPlayers.find((p) => p.id === playerId);
        if (target) {
          Object.assign(target, updates);
        }
      }
    }

    // Apply server state updates
    if (result.serverStateUpdates) {
      Object.assign(updatedServerState, result.serverStateUpdates);
    }

    // Apply room state updates
    if (result.roomStateUpdates) {
      Object.assign(updatedRoomState, result.roomStateUpdates);
    }
  }

  return {
    players: updatedPlayers,
    serverGameState: updatedServerState,
    roomState: updatedRoomState,
  };
}

/**
 * Helper: Apply a SetupResult to existing state objects (in-place mutation).
 * Used in migration to integrate with existing imperative code.
 *
 * @param result - Setup result from character function
 * @param players - Player array to mutate
 * @param serverGameState - Server state to mutate
 * @param roomState - Room state to mutate
 */
export function applySetupResult(
  result: SetupResult,
  players: Player[],
  serverGameState: ServerGameState,
  roomState: RoomState
): void {
  // Apply player updates
  if (result.playerUpdates) {
    for (const [playerId, updates] of result.playerUpdates) {
      const target = players.find((p) => p.id === playerId);
      if (target) {
        Object.assign(target, updates);
      }
    }
  }

  // Apply server state updates
  if (result.serverStateUpdates) {
    Object.assign(serverGameState, result.serverStateUpdates);
  }

  // Apply room state updates
  if (result.roomStateUpdates) {
    Object.assign(roomState, result.roomStateUpdates);
  }
}
