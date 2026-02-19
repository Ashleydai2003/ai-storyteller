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
  | "nomination"   // Nominations open; players may nominate
  | "accusation"   // One player has been nominated; 5-min accusation/defence timer
  | "voting"       // Voting on a nomination
  | "dusk"         // Execution announcement — host must dismiss before night begins
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

  // Dawn announcement — who died last night (set at start of each day, cleared after)
  lastNightDeaths?: string[]; // player names

  // Execution announced at end of day before night begins.
  // "" = no execution this day; a name = that player was executed.
  lastExecutedName?: string;
  // When the block tied, contains the tied player names (no one is executed).
  lastExecutedTie?: string[];

  // Day phase timer
  dayTimerEndsAt?: number; // epoch ms — when current day/nomination timer expires

  // Accusation phase — pending nomination waiting for host to start vote
  pendingNomination?: {
    nominatorId: string;
    nominatedId: string;
    nominatorName: string;
    nominatedName: string;
  };
  accusationTimerEndsAt?: number; // epoch ms — accusation/defence timer

  // Nominations & voting
  playersOnBlock?: string[];                     // Player IDs currently on the block
  blockVoteCounts?: Record<string, number>;      // playerId → highest vote count today
  activeVote?: ActiveVote;                       // in-progress nomination vote

  // Hidden state (only on server, not sent to clients)
  // These are managed separately

  // Game over
  winner?: "good" | "evil"; // Set when phase === "ended"
  winReason?: string;        // Human-readable reason
}

// Active vote — one nomination being voted on
export interface ActiveVote {
  nominatorId: string;
  nominatedId: string;
  nominatorName: string;
  nominatedName: string;
  yesVoterIds: string[];          // IDs who voted yes (in order)
  voterOrder: string[];           // eligible voter IDs, clockwise from nominated+1
  currentVoterIndex: number;      // who is currently voting
  voteTimerEndsAt: number;        // epoch ms for current voter's 10s window
  results: Record<string, boolean>; // playerId → voted yes?
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

  /**
   * Player names who actually die this night (after protection/soldier checks).
   * Populated immediately when the kill resolves so later steps see correct alive state.
   * Collected into RoomState.lastNightDeaths at endNight().
   */
  nightDeaths?: string[];

  /**
   * The character played by the player who was executed at the end of the previous day.
   * Cleared when a new day starts. Used by the Undertaker on subsequent nights.
   */
  lastExecutedCharacter?: Character;
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
  | { type: "host:startNominations" }
  | { type: "host:extendTimer"; seconds: number }
  | { type: "host:startVote" }
  | { type: "host:goToNight" }
  | { type: "host:proceedToNight" }
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
  | { type: "vote:result"; playerId: string; voted: boolean }
  | { type: "vote:end"; nominatedId: string; yesVotes: number; votesNeeded: number; onBlock: boolean }
  | { type: "day:execution"; playerName: string }
  | { type: "game:over"; winner: "good" | "evil"; reason: string };

// Night Actions — the server knows which handler is active,
// so the client just sends selected target(s).
export type NightAction =
  | { action: "choose"; targetIds: string[] } // Player selected 1+ targets
  | { action: "none" };                        // No action / skip

// Wake Prompts
export interface WakePrompt {
  character: Character;
  promptType: "choose" | "info" | "grimoire";
  instruction: string;
  options?: string[]; // Player IDs that can be selected
  selectCount?: number; // How many to select
  grimoire?: GrimoireEntry[]; // Structured grimoire for Spy (in seating order)
  /** Structured minion info — shown instead of raw instruction text. */
  minionInfo?: {
    demonName: string;
    otherMinionNames: string[];
  };
}

/** One row in the Spy's grimoire — sent in seating order. */
export interface GrimoireEntry {
  playerId: string;
  playerName: string;
  character: Character;
  characterType: CharacterType;
  states: PlayerState[];
  alive: boolean;
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
