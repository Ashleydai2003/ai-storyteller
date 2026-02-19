import type {
  Character,
  CharacterType,
  TownsfolkCharacter,
  OutsiderCharacter,
  MinionCharacter,
  DemonCharacter,
  Player,
} from "./types";

// Character distribution rules for Trouble Brewing
export const PLAYER_DISTRIBUTION: Record<number, { townsfolk: number; outsiders: number; minions: number; demons: number }> = {
  5:  { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  6:  { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
  7:  { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
  8:  { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
  9:  { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 },
};

// All available Trouble Brewing characters by type
export const ALL_TOWNSFOLK: TownsfolkCharacter[] = [
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

export const ALL_OUTSIDERS: OutsiderCharacter[] = [
  "butler",
  "drunk",
  "recluse",
  "saint",
];

export const ALL_MINIONS: MinionCharacter[] = [
  "poisoner",
  "spy",
  "scarlet_woman",
  "baron",
];

export const ALL_DEMONS: DemonCharacter[] = ["imp"];

// Character type lookup
export const CHARACTER_TYPE_MAP: Record<Character, CharacterType> = {
  // Townsfolk
  washerwoman: "townsfolk",
  librarian: "townsfolk",
  investigator: "townsfolk",
  chef: "townsfolk",
  empath: "townsfolk",
  fortune_teller: "townsfolk",
  undertaker: "townsfolk",
  monk: "townsfolk",
  ravenkeeper: "townsfolk",
  virgin: "townsfolk",
  slayer: "townsfolk",
  soldier: "townsfolk",
  mayor: "townsfolk",
  // Outsiders
  butler: "outsider",
  drunk: "outsider",
  recluse: "outsider",
  saint: "outsider",
  // Minions
  poisoner: "minion",
  spy: "minion",
  scarlet_woman: "minion",
  baron: "minion",
  // Demons
  imp: "demon",
};

// Helper to shuffle an array (Fisher-Yates)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick `count` random elements from an array
function pickRandom<T>(arr: T[], count: number): T[] {
  return shuffle(arr).slice(0, count);
}

export interface CharacterAssignment {
  character: Character;
  /** What the player sees (e.g. "townsfolk" for a drunk-as-washerwoman) */
  type: CharacterType;
  /** Actual registration for game mechanics (e.g. "outsider" for drunk) */
  actualType: CharacterType;
  /** Whether this character is the Drunk */
  isDrunk: boolean;
}

export interface BagResult {
  /** One entry per player — character, visible type, actual type. */
  assignments: CharacterAssignment[];
  /** Which townsfolk character the drunk thinks they are (null if no drunk) */
  drunkAs: TownsfolkCharacter | null;
  /** Characters NOT in play (for demon bluffs) */
  notInPlay: Character[];
}

/**
 * Generate a random bag of characters for Trouble Brewing.
 *
 * Key rules:
 * - Baron: if drawn as a minion, +2 outsiders and -2 townsfolk
 * - Drunk: if drawn as an outsider, pick an extra townsfolk to show the drunk player
 *   (that townsfolk is NOT actually in the game)
 */
export function generateBag(playerCount: number): BagResult {
  const dist = PLAYER_DISTRIBUTION[playerCount];
  if (!dist) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 5-15.`);
  }

  let { townsfolk: numTownsfolk, outsiders: numOutsiders, minions: numMinions } = dist;

  // Step 1: Draw minions first (Baron affects composition)
  const drawnMinions = pickRandom(ALL_MINIONS, numMinions);

  // If Baron is drawn, adjust: +2 outsiders, -2 townsfolk
  if (drawnMinions.includes("baron")) {
    numOutsiders = Math.min(numOutsiders + 2, ALL_OUTSIDERS.length);
    numTownsfolk = playerCount - numOutsiders - numMinions - 1; // -1 for demon
  }

  // Step 2: Draw demon (always imp in Trouble Brewing)
  const drawnDemons: DemonCharacter[] = ["imp"];

  // Step 3: Draw outsiders
  const drawnOutsiders = pickRandom(ALL_OUTSIDERS, numOutsiders);

  // Step 4: Draw townsfolk
  let drunkAs: TownsfolkCharacter | null = null;
  let drawnTownsfolk: TownsfolkCharacter[];

  if (drawnOutsiders.includes("drunk")) {
    // Drunk is in play — pick one extra townsfolk for the drunk to "be"
    // The drunk will see this townsfolk character, but the actual character is "drunk"
    drawnTownsfolk = pickRandom(ALL_TOWNSFOLK, numTownsfolk + 1);
    // Last one is the "fake" townsfolk the drunk thinks they are
    drunkAs = drawnTownsfolk.pop()!;
  } else {
    drawnTownsfolk = pickRandom(ALL_TOWNSFOLK, numTownsfolk);
  }

  // Build the full bag
  const allDrawn: Character[] = [
    ...drawnTownsfolk,
    ...drawnOutsiders,
    ...drawnMinions,
    ...drawnDemons,
  ];

  // Build combined assignments (character + visible type + actual type in one object)
  const assignments: CharacterAssignment[] = [];

  for (const char of allDrawn) {
    if (char === "drunk" && drunkAs) {
      // Drunk player sees a townsfolk character, but registers as outsider
      assignments.push({
        character: drunkAs,
        type: "townsfolk",
        actualType: "outsider",
        isDrunk: true,
      });
    } else {
      const type = CHARACTER_TYPE_MAP[char];
      assignments.push({
        character: char,
        type,
        actualType: type,
        isDrunk: false,
      });
    }
  }

  // Characters not in play (for demon bluffs + general reference)
  const allCharacters: Character[] = [
    ...ALL_TOWNSFOLK,
    ...ALL_OUTSIDERS,
    ...ALL_MINIONS,
    ...ALL_DEMONS,
  ];
  // notInPlay should exclude the characters actually drawn AND the drunkAs character
  const inPlaySet = new Set<Character>(allDrawn);
  if (drunkAs) inPlaySet.add(drunkAs);
  const notInPlay = allCharacters.filter((c) => !inPlaySet.has(c));

  return {
    assignments: shuffle(assignments), // Shuffle so position in bag isn't predictable
    drunkAs,
    notInPlay,
  };
}

/**
 * Assign characters from a generated bag to players.
 * Updates player objects in-place and returns the assignment map.
 */
export function assignCharacters(
  players: Player[],
  bag: BagResult
): Map<string, Character> {
  if (players.length !== bag.assignments.length) {
    throw new Error(
      `Player count (${players.length}) doesn't match bag size (${bag.assignments.length})`
    );
  }

  const actualCharacters = new Map<string, Character>();

  // Shuffle players to randomize who gets what
  const shuffledIndices = shuffle(players.map((_, i) => i));

  for (let i = 0; i < players.length; i++) {
    const playerIdx = shuffledIndices[i];
    const player = players[playerIdx];
    const a = bag.assignments[i];

    // What the player sees
    player.character = a.character;
    player.characterType = a.type;

    // What the game mechanics use (always matches visible type, except for Drunk)
    player.characterRegistration = a.actualType;

    // Track actual character for server reference
    actualCharacters.set(player.id, a.character);

    // If the player is the drunk, add the drunk state
    if (a.isDrunk) {
      player.states.push("drunk");
    }
  }

  return actualCharacters;
}

/**
 * Generate 3 demon bluffs from characters not in play.
 * Must be townsfolk or outsider characters only.
 */
export function generateDemonBluffs(notInPlay: Character[]): Character[] {
  const validBluffs = notInPlay.filter((c) => {
    const type = CHARACTER_TYPE_MAP[c];
    // "drunk" is an outsider mechanically but is never a valid bluff —
    // it's a secret identity that players don't actually hold.
    return (type === "townsfolk" || type === "outsider") && c !== "drunk";
  });
  return pickRandom(validBluffs, Math.min(3, validBluffs.length));
}

/**
 * Pick a red herring player for the Fortune Teller.
 * Should be a good player (townsfolk or outsider by registration).
 */
export function pickFortuneTellerRedHerring(players: Player[]): string | undefined {
  const goodPlayers = players.filter(
    (p) =>
      p.characterRegistration === "townsfolk" ||
      p.characterRegistration === "outsider"
  );
  if (goodPlayers.length === 0) return undefined;
  return pickRandom(goodPlayers, 1)[0].id;
}
