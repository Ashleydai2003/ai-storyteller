// Character Types
export type CharacterType = "townsfolk" | "outsider" | "minion" | "demon";

export type TownsfolkCharacter =
  | "washerwoman"
  | "librarian"
  | "investigator"
  | "chef"
  | "empath"
  | "fortune_teller"
  | "undertaker"
  | "monk"
  | "ravenkeeper"
  | "virgin"
  | "slayer"
  | "soldier"
  | "mayor";

export type OutsiderCharacter = "butler" | "drunk" | "recluse" | "saint";

export type MinionCharacter =
  | "poisoner"
  | "spy"
  | "scarlet_woman"
  | "baron";

export type DemonCharacter = "imp";

export type Character =
  | TownsfolkCharacter
  | OutsiderCharacter
  | MinionCharacter
  | DemonCharacter;

// Player State
export type PlayerState = "drunk" | "poisoned" | "protected";

export interface Player {
  id: string;
  name: string;
  alive: boolean;
  character: Character | null;
  characterType: CharacterType | null;
  characterRegistration: CharacterType | null; // Actual type for game mechanics
  states: PlayerState[];
  ability: boolean;
  ableToNominate: boolean;
  ableToBeNominated: boolean;
  deadVoted: boolean;
}

// Game Phases
export type GamePhase =
  | "waiting"      // Waiting for players to join
  | "setup"        // Host arranging seating
  | "night"        // Night phase
  | "day"          // Day phase - discussion
  | "nomination"   // Nomination phase
  | "voting"       // Voting on a nomination
  | "ended";       // Game over

// Room State (shared between server and clients)
export interface RoomState {
  phase: GamePhase;
  players: Player[];
  hostId: string | null;
  gameJoinCode: string;

  // Game-specific state (populated after setup)
  seatingOrder?: string[]; // Player IDs in seating order
  roundNumber?: number;
  isDay?: boolean;

  // Night tracking
  currentNightOrder?: number;

  // Nomination/voting
  playersOnBlock?: string[]; // Player IDs
  currentNomination?: {
    nominatorId: string;
    nominatedId: string;
    votes: number;
  };
  votesNeeded?: number;

  // Hidden state (only on server, not sent to clients)
  // These are managed separately
}

// Night step — one per character wake in the night loop
export interface NightStep {
  handler: string; // Which handler to run: "minion_info", "demon_info", "poisoner", etc.
  playerId: string;
  playerName: string;
  character: Character;
}

// Server-only state (never sent to clients)
export interface ServerGameState {
  demonBluffs: Character[];
  fortuneTellerRedHerring?: string; // Player ID
  actualCharacters: Map<string, Character>; // Player ID -> actual character

  // Pre-computed night orders — built once when characters are assigned.
  // Each entry is a NightStep template; at runtime we filter for alive players.
  firstNightOrder: NightStep[];
  otherNightsOrder: NightStep[];

  // Current-night execution state
  nightSteps?: NightStep[];
  currentNightStepIndex?: number;
  currentStepPhase?: "awaiting_action" | "awaiting_acknowledge";

  // Night state tracking
  butlerMasters?: Record<string, string>; // playerId → masterId
  pendingKills?: string[]; // playerIds marked for death this night
}

// WebSocket Messages
export type ClientMessage =
  | { type: "host:create"; token: string }
  | { type: "player:join"; name: string; token: string }
  | { type: "player:leave" }
  | { type: "host:start" }
  | { type: "host:setSeating"; seatingOrder: string[] }
  | { type: "host:confirmSeating" }
  | { type: "host:beginNight" }
  | { type: "player:acknowledge" }
  | { type: "player:nightAction"; action: NightAction }
  | { type: "player:nominate"; targetId: string }
  | { type: "player:vote"; vote: boolean }
  | { type: "player:slay"; targetId: string };

export type ServerMessage =
  | { type: "sync"; state: RoomState }
  | { type: "error"; message: string }
  | { type: "character:reveal"; character: Character; characterType: CharacterType }
  | { type: "demon:bluffs"; bluffs: Character[] }
  | { type: "player:wake"; prompt: WakePrompt }
  | { type: "player:sleep" }
  | { type: "player:info"; info: PlayerInfo }
  | { type: "game:announcement"; text: string }
  | { type: "vote:start"; nominatedId: string; nominatorId: string }
  | { type: "vote:turn"; playerId: string; timeRemaining: number }
  | { type: "vote:result"; playerId: string; voted: boolean };

// Night Actions — the server knows which handler is active,
// so the client just sends selected target(s).
export type NightAction =
  | { action: "choose"; targetIds: string[] } // Player selected 1+ targets
  | { action: "none" };                        // No action / skip

// Wake Prompts
export interface WakePrompt {
  character: Character;
  promptType: "choose" | "info";
  instruction: string;
  options?: string[]; // Player IDs that can be selected
  selectCount?: number; // How many to select
}

// Player Info (shown to player)
export interface PlayerInfo {
  message: string;
  players?: { id: string; name: string }[];
  character?: Character;
}

// Persistent game log entry
export interface GameLogEntry {
  timestamp: string; // ISO 8601
  event: string; // Machine-readable event name
  detail: Record<string, unknown>; // Structured payload
}
