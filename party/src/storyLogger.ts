/**
 * Story Logger - Clean narrative log for AI retelling.
 *
 * This logger records only story-relevant events in a structured format.
 * It's separate from debug logs and only includes information needed
 * for generating the game narrative.
 */

import type { Character, CharacterType } from "@ai-botc/game-logic";

export interface StoryLogEntry {
  timestamp: string; // ISO 8601
  event: string;
  detail: Record<string, unknown>;
}

export interface CharacterAssignment {
  playerName: string;
  character: Character;
  trueCharacter: Character;
  characterType: CharacterType;
  characterRegistration: CharacterType;
}

export interface NightActionLog {
  playerName: string;
  character: Character;
  action?: string; // What they did (e.g., "chose Alice")
  information?: string; // What they learned
  reason?: string; // Why they got that info (e.g., "Alice is red herring")
}

export interface NominationLog {
  nominatorName: string;
  nominatedName: string;
  votes: string[]; // Ordered list of player names who voted yes
  voteCount: number;
  votesNeeded: number;
  putOnBlock: boolean;
}

/**
 * Story Logger - Records clean narrative events for AI retelling.
 */
export class StoryLogger {
  private log: StoryLogEntry[] = [];

  constructor(private storage: DurableObjectStorage) {}

  /**
   * Load existing story log from storage.
   */
  async load(): Promise<void> {
    const stored = await this.storage.get<StoryLogEntry[]>("storyLog");
    this.log = stored ?? [];
  }

  /**
   * Get the full story log.
   */
  getLog(): StoryLogEntry[] {
    return [...this.log];
  }

  /**
   * Clear the story log.
   */
  async clear(): Promise<void> {
    this.log = [];
    await this.storage.delete("storyLog");
  }

  /**
   * Add a story event to the log and persist.
   */
  async addEvent(event: string, detail: Record<string, unknown>): Promise<void> {
    const entry: StoryLogEntry = {
      timestamp: new Date().toISOString(),
      event,
      detail,
    };
    this.log.push(entry);
    await this.storage.put("storyLog", this.log);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Game Setup
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async logCharacterAssignments(assignments: CharacterAssignment[]): Promise<void> {
    await this.addEvent("setup:characters", { assignments });
  }

  async logDemonBluffs(demonName: string, bluffs: Character[]): Promise<void> {
    await this.addEvent("setup:bluffs", { demonName, bluffs });
  }

  async logRedHerring(playerName: string): Promise<void> {
    await this.addEvent("setup:redHerring", { playerName });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Night Phase
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async logNightStart(nightNumber: number): Promise<void> {
    await this.addEvent("night:start", { nightNumber });
  }

  async logNightAction(action: NightActionLog): Promise<void> {
    await this.addEvent("night:action", action);
  }

  /**
   * Log when a player receives information during the night.
   */
  async logPlayerInfo(params: {
    playerName: string;
    character: string;
    states?: string[]; // e.g., ["drunk"], ["poisoned"], or ["drunk", "poisoned"]
    infoShown: string;
    reason?: string;
  }): Promise<void> {
    await this.addEvent("night:info", params);
  }

  /**
   * Log when a player takes an action during the night.
   */
  async logPlayerAction(params: {
    playerName: string;
    character: string;
    states?: string[]; // e.g., ["drunk"], ["poisoned"], or ["drunk", "poisoned"]
    action: string;
    targets?: string[];
    result?: string;
  }): Promise<void> {
    await this.addEvent("night:playerAction", params);
  }

  async logNightKill(params: {
    killerName: string;
    targetName: string;
    protected?: boolean;
    soldier?: boolean;
    mayorBounce?: boolean;
    bouncedTo?: string;
    actuallyDied: boolean;
  }): Promise<void> {
    await this.addEvent("night:kill", params);
  }

  async logNightProtection(monkName: string, targetName: string): Promise<void> {
    await this.addEvent("night:protection", { monkName, targetName });
  }

  async logNightPoison(poisonerName: string, targetName: string): Promise<void> {
    await this.addEvent("night:poison", { poisonerName, targetName });
  }

  async logStarpass(impName: string, newImpName: string): Promise<void> {
    await this.addEvent("night:starpass", { impName, newImpName });
  }

  async logNightRavenkeeper(params: {
    ravenkeeperName: string;
    targetName: string;
    revealedCharacter: Character;
    actualCharacter: Character;
    wasCorrect: boolean;
  }): Promise<void> {
    await this.addEvent("night:ravenkeeper", params);
  }

  async logNightEnd(nightNumber: number, deaths: string[]): Promise<void> {
    await this.addEvent("night:end", { nightNumber, deaths });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Day Phase
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async logDayStart(dayNumber: number): Promise<void> {
    await this.addEvent("day:start", { dayNumber });
  }

  async logNomination(nomination: NominationLog): Promise<void> {
    await this.addEvent("day:nomination", nomination);
  }

  async logSlayAttempt(params: {
    slayerName: string;
    targetName: string;
    success: boolean;
    reason?: string; // Why it failed (e.g., "target was not demon", "slayer was drunk")
  }): Promise<void> {
    await this.addEvent("day:slay", params);
  }

  async logVirginTrigger(params: {
    virginName: string;
    nominatorName: string;
    triggered: boolean;
    reason?: string; // Why it failed (e.g., "virgin was drunk", "nominator was not townsfolk")
  }): Promise<void> {
    await this.addEvent("day:virgin", params);
  }

  async logExecution(params: {
    playerName: string;
    character: Character;
    tied?: boolean;
    tiedWith?: string[];
  }): Promise<void> {
    await this.addEvent("day:execution", params);
  }

  async logNoExecution(reason: string): Promise<void> {
    await this.addEvent("day:noExecution", { reason });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Game End
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async logGameEnd(winner: "good" | "evil", reason: string): Promise<void> {
    await this.addEvent("game:end", { winner, reason });
  }
}
