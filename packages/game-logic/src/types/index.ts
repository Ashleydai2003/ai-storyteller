/**
 * Core type definitions for Blood on the Clocktower game logic.
 *
 * This file defines:
 * - Character types and names (Trouble Brewing edition)
 * - Player state model
 * - Game phases and room state
 * - WebSocket message protocols
 * - Night action and wake prompt types
 */

// ─────────────────────────────────────────────────────────────
// Characters (Trouble Brewing edition)
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Player Model
// ─────────────────────────────────────────────────────────────

/** Active effects on a player */
export type PlayerState = "drunk" | "poisoned" | "protected";

export interface Player {
  /** Stable UUID token (NOT WebSocket connection ID) */
  id: string;
  name: string;
  alive: boolean;
  /**
   * What the player sees as their character.
   * May differ from trueCharacter for Drunk (sees a Townsfolk).
   */
  character: Character | null;
  /**
   * The actual character (e.g., "drunk" for a Drunk who thinks they're Empath).
   * Same as character for most players.
   */
  trueCharacter: Character | null;
  /**
   * What the player sees as their type (townsfolk/outsider/minion/demon).
   * May differ from actual for Drunk.
   */
  characterType: CharacterType | null;
  /**
   * How this player registers to information abilities.
   * - Most players: same as their actual type
   * - Drunk: "outsider" (their true type)
   * - Recluse: randomly "minion" or "demon" (set at game start)
   */
  characterRegistration: CharacterType | null;
  /** Active effects: drunk, poisoned, protected */
  states: PlayerState[];
  /** Has one-shot ability remaining (e.g., Slayer) */
  ability: boolean;
  /** Can nominate someone today (reset each day, false if dead) */
  ableToNominate: boolean;
  /** Can be nominated today (becomes false after being nominated once) */
  ableToBeNominated: boolean;
  /** Has used their one dead vote */
  deadVoted: boolean;
}

// ─────────────────────────────────────────────────────────────
// Game Phases & Room State
// ─────────────────────────────────────────────────────────────

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

/**
 * Room state shared between server and all clients.
 * This is the single source of truth broadcast to everyone.
 * Secret info (character assignments, demon bluffs) is sent via targeted messages.
 */
export interface RoomState {
  phase: GamePhase;
  players: Player[];
  hostId: string | null;
  gameJoinCode: string;

  // Setup phase — host character selection
  selectedCharacters?: Character[]; // Characters the host wants to include
  setupComplete?: boolean;          // Host has finished setup (characters + seating)

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

  // Mini-game leaderboard (accumulated across all nights)
  miniGameLeaderboard?: MiniGameLeaderboard;
}

/** In-progress vote on a nomination */
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

/**
 * Server-only state — NEVER sent to clients.
 * Contains secret information like true character assignments and demon bluffs.
 */
export interface ServerGameState {
  demonBluffs: Character[];
  fortuneTellerRedHerring?: string; // Player ID
  actualCharacters: Map<string, Character>; // Player ID -> actual character

  // Current-night execution state
  currentNightHandler?: string; // Current character handler being executed
  currentNightHandlerIndex?: number; // Index in the night order
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
  /**
   * The character registration of the executed player (for Recluse handling in Undertaker).
   */
  lastExecutedRegistration?: CharacterType;
  /**
   * Player ID of who was executed yesterday (for "died-today" reminder token).
   * Cleared when a new day starts.
   */
  lastExecutedPlayerId?: string;

  /**
   * Reminder tokens for information abilities (tracks Storyteller info).
   * Used by Spy grimoire to show which players were presented to which abilities.
   */
  investigatorMinion?: string; // Player ID shown as minion to Investigator
  investigatorWrong?: string; // Player ID shown as "wrong" to Investigator
  librarianOutsider?: string; // Player ID shown as outsider to Librarian
  librarianWrong?: string; // Player ID shown as "wrong" to Librarian
  washerwomanTownsfolk?: string; // Player ID shown as townsfolk to Washerwoman
  washerwomanWrong?: string; // Player ID shown as "wrong" to Washerwoman
}

// ─────────────────────────────────────────────────────────────
// WebSocket Message Protocols
// ─────────────────────────────────────────────────────────────

/** Messages sent from client to server */
export type ClientMessage =
  | { type: "host:create"; token: string }
  | { type: "host:setApiKey"; provider: "anthropic" | "openai"; apiKey: string }
  | { type: "host:setCharacters"; characters: Character[] }
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
  | { type: "player:slay"; targetId: string }
  | { type: "minigame:score"; night: number; game: MiniGameType; score: number };

/** Messages sent from server to client */
export type ServerMessage =
  | { type: "sync"; state: RoomState }
  | { type: "error"; message: string }
  | { type: "api:keySet"; provider: "anthropic" | "openai"; success: boolean }
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
  | { type: "game:over"; winner: "good" | "evil"; reason: string }
  | { type: "debug:log"; level: "log" | "info" | "warn" | "error"; message: string; data?: unknown; timestamp: string };

// ─────────────────────────────────────────────────────────────
// Night Phase Types
// ─────────────────────────────────────────────────────────────

/**
 * Player's response to a night action prompt.
 * Server knows which handler is active, so client just sends targets.
 */
export type NightAction =
  | { action: "choose"; targetIds: string[] } // Player selected 1+ targets
  | { action: "none" };                        // No action / skip

/** Prompt shown to a player when they wake during the night */
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

/** Reminder token types for the Spy's grimoire */
export type ReminderToken =
  | "died-today"
  | "drunk"
  | "imp-dead"
  | "investigator-minion"
  | "investigator-wrong"
  | "librarian-outsider"
  | "librarian-wrong"
  | "washerwoman-townsfolk"
  | "washerwoman-wrong"
  | "poisoned"
  | "red-herring"
  | "scarlet-woman-imp"
  | "slayer-no-ability"
  | "virgin-no-ability"
  | "butler-master"
  | "protected";

/** One row in the Spy's grimoire — sent in seating order. */
export interface GrimoireEntry {
  playerId: string;
  playerName: string;
  character: Character;
  characterType: CharacterType;
  states: PlayerState[];
  alive: boolean;
  /** Reminder tokens for this player (used by Spy grimoire) */
  reminderTokens?: ReminderToken[];
}

// ─────────────────────────────────────────────────────────────
// Misc Types
// ─────────────────────────────────────────────────────────────

/** Generic info message shown to a player */
export interface PlayerInfo {
  message: string;
  players?: { id: string; name: string }[];
  character?: Character;
}

/** Persistent game log entry for debugging */
export interface GameLogEntry {
  timestamp: string; // ISO 8601
  event: string; // Machine-readable event name
  detail: Record<string, unknown>; // Structured payload
}

// ─────────────────────────────────────────────────────────────
// Character System Types (for new architecture)
// ─────────────────────────────────────────────────────────────

/** Context passed to character setup functions */
export interface SetupContext {
  players: Player[];
  serverGameState: ServerGameState;
  roomState: RoomState;
  /** Deterministic random function (for testing) */
  random: () => number;
}

/** State updates returned by setup functions */
export interface SetupResult {
  playerUpdates?: Map<string, Partial<Player>>;
  serverStateUpdates?: Partial<ServerGameState>;
  roomStateUpdates?: Partial<RoomState>;
}

/** Context passed to night handler functions */
export interface NightContext extends SetupContext {
  playerId: string;
  targetIds?: string[];
}

/** Result returned by night handler functions */
export interface NightResult {
  playerUpdates?: Map<string, Partial<Player>>;
  serverStateUpdates?: Partial<ServerGameState>;
  announcement?: string;
  wakePrompt?: WakePrompt;
  skipAcknowledge?: boolean;
}

/** Context passed to day ability functions */
export interface DayContext extends SetupContext {
  actorId: string;
  targetId?: string;
}

/** Result returned by day ability functions */
export interface DayResult {
  playerUpdates?: Map<string, Partial<Player>>;
  serverStateUpdates?: Partial<ServerGameState>;
  roomStateUpdates?: Partial<RoomState>;
  announcement?: string;
  success: boolean;
}

/** Context passed to win condition checkers */
export interface WinContext {
  players: Player[];
  serverGameState: ServerGameState;
  roomState: RoomState;
}

/** Result returned by win condition checkers */
export interface WinResult {
  gameOver: boolean;
  winner?: "good" | "evil";
  reason?: string;
}

// ─────────────────────────────────────────────────────────────
// Mini-Game Types
// ─────────────────────────────────────────────────────────────

export type MiniGameType = "jumping" | "falling" | "catching" | "reaction";

export interface MiniGameScore {
  night: number;
  game: MiniGameType;
  score: number;
}

export interface MiniGamePlayerStats {
  playerName: string;
  totalScore: number;
  gameScores: MiniGameScore[];
}

export type MiniGameLeaderboard = Record<string, MiniGamePlayerStats>;
