/**
 * Character definitions registry.
 *
 * Each character has optional setup, night handler, day ability, and win condition functions.
 * All functions are pure - they return state updates without mutation.
 */

import type {
  Character,
  CharacterType,
  Player,
  RoomState,
  ServerGameState,
  SetupContext,
  SetupResult,
  NightContext,
  NightResult,
  DayContext,
  DayResult,
  WinContext,
  WinResult,
} from "./types/index";

// ─────────────────────────────────────────────────────────────
// Character Definition Interface
// ─────────────────────────────────────────────────────────────

export interface CharacterDefinition {
  character: Character;
  type: CharacterType;

  /** Night wake metadata */
  nightMeta?: {
    firstNight?: number; // Position in first night order (1-based)
    otherNights?: number; // Position in other nights order (1-based)
  };

  /** Setup function called during character assignment */
  setup?: (ctx: SetupContext) => SetupResult;

  /** Night action handler */
  nightHandler?: (ctx: NightContext) => Promise<NightResult> | NightResult;

  /** Day ability handler (e.g., Slayer, Virgin) */
  dayAbility?: (ctx: DayContext) => Promise<DayResult> | DayResult;

  /** Win condition checker (e.g., Mayor) */
  checkWinCondition?: (ctx: WinContext) => WinResult;
}

// ─────────────────────────────────────────────────────────────
// Character Registry
// ─────────────────────────────────────────────────────────────

/**
 * Central registry of all character definitions.
 * To add a new character, add an entry here with its handlers.
 */
export const CHARACTER_REGISTRY: Record<Character, CharacterDefinition> = {
  // Townsfolk
  washerwoman: {
    character: "washerwoman",
    type: "townsfolk",
    nightMeta: { firstNight: 1 },
  },
  librarian: {
    character: "librarian",
    type: "townsfolk",
    nightMeta: { firstNight: 2 },
  },
  investigator: {
    character: "investigator",
    type: "townsfolk",
    nightMeta: { firstNight: 3 },
  },
  chef: {
    character: "chef",
    type: "townsfolk",
    nightMeta: { firstNight: 4 },
  },
  empath: {
    character: "empath",
    type: "townsfolk",
    nightMeta: { firstNight: 5, otherNights: 5 },
  },
  fortune_teller: {
    character: "fortune_teller",
    type: "townsfolk",
    nightMeta: { firstNight: 6, otherNights: 6 },
  },
  undertaker: {
    character: "undertaker",
    type: "townsfolk",
    nightMeta: { otherNights: 7 },
  },
  monk: {
    character: "monk",
    type: "townsfolk",
    nightMeta: { otherNights: 1 },
  },
  ravenkeeper: {
    character: "ravenkeeper",
    type: "townsfolk",
    nightMeta: { otherNights: 5 }, // After Imp (position 4)
  },
  virgin: {
    character: "virgin",
    type: "townsfolk",
  },
  slayer: {
    character: "slayer",
    type: "townsfolk",
  },
  soldier: {
    character: "soldier",
    type: "townsfolk",
  },
  mayor: {
    character: "mayor",
    type: "townsfolk",
  },

  // Outsiders
  butler: {
    character: "butler",
    type: "outsider",
    nightMeta: { firstNight: 7, otherNights: 2 },
  },
  drunk: {
    character: "drunk",
    type: "outsider",
  },
  recluse: {
    character: "recluse",
    type: "outsider",
  },
  saint: {
    character: "saint",
    type: "outsider",
  },

  // Minions
  poisoner: {
    character: "poisoner",
    type: "minion",
    nightMeta: { otherNights: 3 },
  },
  spy: {
    character: "spy",
    type: "minion",
    nightMeta: { firstNight: 9, otherNights: 9 },
  },
  scarlet_woman: {
    character: "scarlet_woman",
    type: "minion",
  },
  baron: {
    character: "baron",
    type: "minion",
  },

  // Demons
  imp: {
    character: "imp",
    type: "demon",
    nightMeta: { otherNights: 4 },
  },
};

/**
 * Get character definition by character name.
 */
export function getCharacterDef(character: Character): CharacterDefinition {
  return CHARACTER_REGISTRY[character];
}

/**
 * Get all characters with setup functions.
 */
export function getCharactersWithSetup(): CharacterDefinition[] {
  return Object.values(CHARACTER_REGISTRY).filter((def) => def.setup);
}
