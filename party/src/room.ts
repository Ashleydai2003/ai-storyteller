import type * as Party from "partykit/server";
import type {
  ClientMessage,
  ServerMessage,
  RoomState,
  Player,
  ServerGameState,
  GameLogEntry,
  NightAction,
  Character,
  MiniGameType,
} from "@ai-botc/game-logic";
import {
  generateBag,
  assignCharacters,
  generateDemonBluffs,
  pickFortuneTellerRedHerring,
} from "@ai-botc/game-logic";

import { GameLogger } from "./gameLog";
import { StoryLogger } from "./storyLogger";
import { DebugLogger } from "./debugLogger";
import {
  getNightOrder,
  resolveHandler,
  dispatchNightStep,
  dispatchNightAction,
  isPlayerEvil,
  type NightContext,
} from "./nightSteps";
import {
  buildVoterOrder,
  computeVotesNeeded,
  updateBlock,
  checkVirginAbility,
  canSlayerUseAbility,
  getCurrentVoter,
  isVotingComplete,
} from "./dayPhase";
import { buildRetellingInput, generateRetelling, detectAIConfig, type AIConfig } from "./storyteller";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RoomServer — PartyKit durable-object server for one game room.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default class RoomServer implements Party.Server {
  readonly room: Party.Room;

  /** Shared state broadcast to all clients. */
  state: RoomState;

  /** Server-only game state (never broadcast to clients). */
  serverGameState: ServerGameState | null = null;

  /** Structured debug logger (for debugging). */
  logger!: GameLogger;

  /** Story logger (clean narrative for AI retelling). */
  storyLogger!: StoryLogger;

  /** Debug logger for web viewer. */
  debugLogger: DebugLogger = new DebugLogger();

  /** Who is currently awake during night (server-only). */
  awakePlayerId: string | null = null;

  /** Server-side timer handles (not persisted — fine for local dev). */
  private dayTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private voteTimerHandle: ReturnType<typeof setTimeout> | null = null;

  /**
   * Host-provided AI API key (kept in memory only).
   * SECURITY: Never logged, never persisted, never broadcast, never in RoomState.
   * Cleared automatically when the PartyKit room is disposed (connection timeout).
   * Not cleared on game end since the retelling feature needs it after game over.
   */
  private hostAIConfig: AIConfig | null = null;

  // ── Ephemeral maps for routing — rebuilt on reconnect ──
  tokenToConnectionId: Map<string, string> = new Map();
  connectionIdToToken: Map<string, string> = new Map();

  // ─── Lifecycle ───

  constructor(room: Party.Room) {
    this.room = room;
    this.state = {
      phase: "waiting",
      players: [],
      hostId: null,
      gameJoinCode: room.id,
    };
  }

  async onStart() {
    const stored = await this.room.storage.get<RoomState>("state");
    if (stored) this.state = stored;

    const serverState =
      await this.room.storage.get<ServerGameState>("serverGameState");
    if (serverState) this.serverGameState = serverState;

    const storedLog =
      await this.room.storage.get<GameLogEntry[]>("gameLog");
    this.logger = new GameLogger(this.room.storage, storedLog ?? []);

    // Initialize story logger
    this.storyLogger = new StoryLogger(this.room.storage);
    await this.storyLogger.load();
  }

  onConnect(connection: Party.Connection) {
    console.log(
      `[CONNECT] Client ${connection.id} connected. Players: ${this.state.players.length}`
    );
    this.sendToConnection(connection, { type: "sync", state: this.state });
  }

  onClose(connection: Party.Connection) {
    const token = this.connectionIdToToken.get(connection.id);
    if (token) {
      console.log(
        `[DISCONNECT] Connection ${connection.id} (token: ${token}) disconnected`
      );
      this.connectionIdToToken.delete(connection.id);
      this.tokenToConnectionId.delete(token);
    }
  }

  // ─── Message routing ───

  onMessage(message: string, sender: Party.Connection) {
    console.log(`[MESSAGE] From ${sender.id}: ${message}`);
    try {
      const data = JSON.parse(message) as ClientMessage;
      this.handleMessage(data, sender);
    } catch (e) {
      console.error("Failed to parse message:", e);
    }
  }

  handleMessage(message: ClientMessage, sender: Party.Connection) {
    switch (message.type) {
      case "host:create":
        this.handleHostCreate(message.token, sender);
        break;
      case "host:setApiKey":
        this.handleHostSetApiKey(message.provider, message.apiKey, sender);
        break;
      case "player:join":
        this.handlePlayerJoin(message.name, message.token, sender);
        break;
      case "player:leave":
        this.handlePlayerLeave(sender);
        break;
      case "host:start":
        this.handleHostStart(sender);
        break;
      case "host:setSeating":
        this.handleSetSeating(message.seatingOrder, sender);
        break;
      case "host:setCharacters":
        this.handleHostSetCharacters(message.characters, sender);
        break;
      case "host:beginNight":
        this.handleHostBeginNight(sender);
        break;
      case "host:confirmSeating":
        this.handleConfirmSeating(sender);
        break;
      case "player:acknowledge":
        this.handlePlayerAcknowledge(sender);
        break;
      case "player:nightAction":
        this.handlePlayerNightAction(message.action, sender);
        break;
      case "host:startNominations":
        this.handleHostStartNominations(sender);
        break;
      case "host:extendTimer":
        this.handleHostExtendTimer(message.seconds, sender);
        break;
      case "host:goToNight":
        this.handleHostGoToNight(sender);
        break;
      case "host:proceedToNight":
        this.handleHostProceedToNight(sender);
        break;
      case "player:nominate":
        this.handlePlayerNominate(message.targetId, sender);
        break;
      case "host:startVote":
        this.handleHostStartVote(sender);
        break;
      case "player:vote":
        this.handlePlayerVote(message.vote, sender);
        break;
      case "player:slay":
        this.handlePlayerSlay(message.targetId, sender);
        break;
      case "minigame:score":
        this.handleMiniGameScore(message.night, message.game, message.score, sender);
        break;
      default:
        console.log("Unknown message type:", message);
    }
  }

  // ─── Connection management ───

  registerConnection(token: string, connection: Party.Connection) {
    const oldConnectionId = this.tokenToConnectionId.get(token);
    if (oldConnectionId && oldConnectionId !== connection.id) {
      this.connectionIdToToken.delete(oldConnectionId);
    }
    const oldToken = this.connectionIdToToken.get(connection.id);
    if (oldToken && oldToken !== token) {
      this.tokenToConnectionId.delete(oldToken);
    }
    this.tokenToConnectionId.set(token, connection.id);
    this.connectionIdToToken.set(connection.id, token);
  }

  getTokenForConnection(connection: Party.Connection): string | undefined {
    return this.connectionIdToToken.get(connection.id);
  }

  // ─── Host handlers ───

  async handleHostCreate(token: string, sender: Party.Connection) {
    console.log(`[HOST] Registering host with token: ${token}`);
    this.registerConnection(token, sender);
    this.state.hostId = token;

    this.debugLogger.info(`Host connected`, { token, roomCode: this.state.gameJoinCode });

    if (this.state.phase === undefined) {
      this.state.phase = "waiting";
    }
    await this.storyLogger.addEvent("room:created", {
      roomCode: this.state.gameJoinCode,
    });
    this.persistAndBroadcast();
  }

  /**
   * Handle host setting an AI API key at runtime.
   * SECURITY: Key is stored in memory only, never logged/persisted/broadcast.
   */
  async handleHostSetApiKey(
    provider: "anthropic" | "openai",
    apiKey: string,
    sender: Party.Connection
  ) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId) {
      return this.sendError(sender, "Only the host can set the API key");
    }

    // Validate the key format minimally (non-empty)
    if (!apiKey || apiKey.trim().length === 0) {
      this.hostAIConfig = null;
      await this.logger.addLog("api:keyCleared", { provider });
      this.sendToToken(token, {
        type: "error",
        message: "API key cleared",
      });
      return;
    }

    const trimmedKey = apiKey.trim();

    // Validate key format (without exposing the actual key)
    const keyPrefix = trimmedKey.substring(0, 8); // First 8 chars for identification
    const isValidFormat = this.validateApiKeyFormat(provider, trimmedKey);

    if (!isValidFormat) {
      await this.logger.addLog("api:keyInvalid", {
        provider,
        keyPrefix,
        reason: "Invalid format",
      });
      this.sendToToken(token, {
        type: "error",
        message: `Invalid ${provider} API key format. Expected ${
          provider === "anthropic" ? "sk-ant-api03-..." : "sk-..."
        }`,
      });
      return;
    }

    // Test the API key with a minimal request
    const isValid = await this.testApiKey(provider, trimmedKey);

    if (!isValid) {
      await this.logger.addLog("api:keyInvalid", {
        provider,
        keyPrefix,
        reason: "Authentication failed",
      });
      this.sendToToken(token, {
        type: "error",
        message: `${provider} API key authentication failed. Please check your key.`,
      });
      return;
    }

    // Store in memory only — never persisted, never logged, never broadcast
    this.hostAIConfig = { provider, apiKey: trimmedKey };

    // Log success (without exposing the key)
    await this.logger.addLog("api:keyValid", { provider, keyPrefix });

    this.sendToToken(token, {
      type: "api:keySet",
      provider,
      success: true,
    });
  }

  /**
   * Validate API key format without making network requests
   */
  validateApiKeyFormat(provider: "anthropic" | "openai", key: string): boolean {
    if (provider === "anthropic") {
      // Anthropic keys: sk-ant-api03-...
      return key.startsWith("sk-ant-") && key.length > 20;
    } else if (provider === "openai") {
      // OpenAI keys: sk-...
      return key.startsWith("sk-") && key.length > 20;
    }
    return false;
  }

  /**
   * Test API key with a minimal request
   * SECURITY: Only tests validity, never logs the actual key
   */
  async testApiKey(provider: "anthropic" | "openai", apiKey: string): Promise<boolean> {
    try {
      if (provider === "anthropic") {
        // Test with a minimal message request
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 1,
            messages: [{ role: "user", content: "test" }],
          }),
        });
        return response.status !== 401 && response.status !== 403;
      } else if (provider === "openai") {
        // Test with models list endpoint (cheaper than completion)
        const response = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
          },
        });
        return response.status !== 401 && response.status !== 403;
      }
      return false;
    } catch (error) {
      console.error(`[API] Failed to test ${provider} key:`, error);
      return false;
    }
  }

  async handleHostStart(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId) {
      return this.sendError(sender, "Only the host can start the game");
    }
    if (this.state.players.length < 5) {
      return this.sendError(sender, "Need at least 5 players to start");
    }
    if (this.state.players.length > 15) {
      return this.sendError(sender, "Maximum 15 players allowed");
    }

    // Clear any previous server-only state for a fresh game
    this.serverGameState = null;
    this.state.selectedCharacters = undefined;
    this.state.setupComplete = false;

    // Initialize seating order (default: join order, host will rearrange and choose characters)
    this.state.seatingOrder = this.state.players.map((p) => p.id);
    this.state.roundNumber = 0;
    this.state.phase = "setup";

    await this.storyLogger.addEvent("phase:transition", {
      from: "waiting",
      to: "setup",
    });

    await this.storyLogger.addEvent("game:setupStarted", {
      playerCount: this.state.players.length,
    });

    await this.persistAndBroadcast();
    console.log(
      `[GAME] Setup started for ${this.state.players.length} players — host may now choose characters and arrange seating.`
    );
  }

  handleSetSeating(seatingOrder: string[], sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId) {
      return this.sendError(sender, "Only the host can set seating");
    }
    if (this.state.phase !== "setup") {
      return this.sendError(sender, "Can only set seating during setup");
    }

    // Validate that seating order contains exactly all player IDs
    const playerIds = new Set(this.state.players.map((p) => p.id));
    if (
      seatingOrder.length !== playerIds.size ||
      !seatingOrder.every((id) => playerIds.has(id))
    ) {
      return this.sendError(sender, "Invalid seating order");
    }

    this.state.seatingOrder = seatingOrder;

    const seatingWithNames = seatingOrder.map((id) => {
      const player = this.state.players.find((p) => p.id === id);
      return { playerId: id, playerName: player?.name ?? "unknown" };
    });
    this.storyLogger.addEvent("game:seatingUpdated", {
      seatingOrder: seatingWithNames.map(s => s.playerName),
    });

    this.persistAndBroadcast();
  }

  handleHostSetCharacters(characters: Character[], sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId) {
      return this.sendError(sender, "Only the host can set characters");
    }
    if (this.state.phase !== "setup") {
      return this.sendError(sender, "Can only set characters during setup");
    }

    // Store selected characters in room state
    this.state.selectedCharacters =
      characters.length > 0 ? Array.from(new Set(characters)) : undefined;
    this.persistAndBroadcast();
  }

  async handleHostBeginNight(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId) {
      return this.sendError(sender, "Only the host can start the game");
    }
    if (this.state.phase !== "setup") {
      return this.sendError(sender, "Can only start Night 1 from setup");
    }
    if (!this.serverGameState || !this.state.setupComplete) {
      return this.sendError(
        sender,
        "Setup is not complete yet — finish arranging seating and characters first"
      );
    }

    // Transition from setup to Night 1
    this.state.roundNumber = 1;
    this.state.phase = "night";
    this.state.isDay = false;
    this.awakePlayerId = null;

    await this.storyLogger.addEvent("phase:transition", {
      from: "setup",
      to: "night",
      roundNumber: 1,
    });

    await this.persistAndBroadcast();
    await this.startNight();
  }

  async handleConfirmSeating(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId) {
      return this.sendError(sender, "Only the host can confirm seating");
    }
    if (this.state.phase !== "setup") {
      return this.sendError(sender, "Can only confirm seating during setup");
    }

    // Generate the character bag and assign characters now that setup is complete.
    console.log(
      `[GAME] Generating bag for ${this.state.players.length} players (setup complete)`
    );

    // Clear any existing character assignments/states
    for (const player of this.state.players) {
      player.character = null;
      player.characterType = null;
      player.characterRegistration = null;
      player.states = [];
    }

    const bag = generateBag(this.state.players.length, {
      requiredCharacters: this.state.selectedCharacters,
    });

    await this.storyLogger.addEvent("game:bagGenerated", {
      playerCount: this.state.players.length,
      charactersInBag: bag.assignments.map((a) => a.character),
    });

    const actualCharacters = assignCharacters(this.state.players, bag);

    // Story log: Already handled by logCharacterAssignments below
    // (keeping detailed character assignments in story log)

    // Generate demon bluffs and fortune teller red herring
    const demonBluffs = generateDemonBluffs(bag.notInPlay);
    const fortuneTellerRedHerring = pickFortuneTellerRedHerring(
      this.state.players
    );

    // Story log: Already handled by logDemonBluffs below

    if (fortuneTellerRedHerring) {
      const redHerringPlayer = this.state.players.find(
        (p) => p.id === fortuneTellerRedHerring
      );
        // Story log: Already handled by logRedHerring below
    }

    // Store server-only state
    this.serverGameState = {
      demonBluffs,
      fortuneTellerRedHerring,
      actualCharacters,
    };

    // Log the night orders from the constants (for story logging)
    const firstNightOrder = getNightOrder(1);
    const otherNightOrder = getNightOrder(2);
    await this.storyLogger.addEvent("game:nightOrdersBuilt", {
      firstNightSteps: Array.from(firstNightOrder),
      otherNightsSteps: Array.from(otherNightOrder),
    });

    // Persist server game state (demon bluffs revealed during first night)
    await this.room.storage.put("serverGameState", this.serverGameState);

    // ━━━━ Story Log: Character Assignments ━━━━
    const assignments = this.state.players.map((p) => ({
      playerName: p.name,
      character: p.character!,
      trueCharacter: p.trueCharacter!,
      characterType: p.characterType!,
      characterRegistration: p.characterRegistration!,
    }));
    await this.storyLogger.logCharacterAssignments(assignments);

    // Story Log: Demon bluffs
    const demon = this.state.players.find((p) => p.characterType === "demon");
    if (demon) {
      await this.storyLogger.logDemonBluffs(demon.name, demonBluffs);
    }

    // Story Log: Red herring
    if (fortuneTellerRedHerring) {
      const redHerringPlayer = this.state.players.find(
        (p) => p.id === fortuneTellerRedHerring
      );
      if (redHerringPlayer) {
        await this.storyLogger.logRedHerring(redHerringPlayer.name);
      }
    }

    // Send characters to each player individually
    for (const player of this.state.players) {
      this.sendToToken(player.id, {
        type: "character:reveal",
        character: player.character!,
        characterType: player.characterType!,
      });
    }

    // Mark setup as complete but remain in setup phase until host starts the game
    this.state.setupComplete = true;

    const seatingWithNames = (this.state.seatingOrder ?? []).map((id) => {
      const player = this.state.players.find((p) => p.id === id);
      return { playerId: id, playerName: player?.name ?? "unknown" };
    });

    await this.storyLogger.addEvent("game:seatingConfirmed", {
      seatingOrder: seatingWithNames.map(s => s.playerName),
    });

    // Stay in setup phase — host will press \"Start Game\" to begin Night 1
    await this.persistAndBroadcast();
  }

  // ─── Night orchestration ───

  async startNight() {
    if (!this.serverGameState) return;

    // Initialize night state
    this.serverGameState.currentNightHandlerIndex = 0;
    this.serverGameState.currentNightHandler = undefined;
    this.serverGameState.currentStepPhase = undefined;
    this.serverGameState.nightDeaths = [];
    await this.room.storage.put("serverGameState", this.serverGameState);

    await this.storyLogger.logNightStart(this.state.roundNumber ?? 1);
    await this.executeNextNightHandler();
  }

  async executeNextNightHandler() {
    if (!this.serverGameState) return;

    const nightOrder = getNightOrder(this.state.roundNumber ?? 1);
    const index = this.serverGameState.currentNightHandlerIndex ?? 0;

    if (index >= nightOrder.length) {
      await this.endNight();
      return;
    }

    const handler = nightOrder[index];
    const players = resolveHandler(handler, this.state, this.serverGameState);

    if (!players || players.length === 0) {
      // Skip this handler, move to next
      this.serverGameState.currentNightHandlerIndex = index + 1;
      await this.room.storage.put("serverGameState", this.serverGameState);
      await this.executeNextNightHandler();
      return;
    }

    // For now, wake the first player (TODO: handle multiple players for minion_info/demon_info)
    const player = players[0];

    this.awakePlayerId = player.id;
    this.serverGameState.currentNightHandler = handler;
    await this.room.storage.put("serverGameState", this.serverGameState);

    const prompted = await dispatchNightStep(
      this.getNightContext(),
      handler,
      player
    );

    if (!prompted) {
      // Unknown handler — skip to next handler automatically
      this.awakePlayerId = null;
      this.serverGameState.currentNightHandlerIndex = index + 1;
      this.serverGameState.currentNightHandler = undefined;
      this.serverGameState.currentStepPhase = undefined;
      await this.room.storage.put("serverGameState", this.serverGameState);
      await this.executeNextNightHandler();
      return;
    }

    // Prompted player:
    //  • "info" handlers → no step phase set, player will send player:acknowledge
    //  • "choose" handlers → step phase = "awaiting_action", player will send player:nightAction
  }

  async handlePlayerAcknowledge(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (!token) return;
    if (token !== this.awakePlayerId) {
      return this.sendError(sender, "You are not currently awake");
    }

    const player = this.state.players.find((p) => p.id === token);
    this.sendToToken(token, { type: "player:sleep" });

    // Story log: Don't log acknowledgments, only actual events

    this.awakePlayerId = null;
    if (this.serverGameState) {
      this.serverGameState.currentNightHandlerIndex =
        (this.serverGameState.currentNightHandlerIndex ?? 0) + 1;
      this.serverGameState.currentStepPhase = undefined;
      await this.room.storage.put("serverGameState", this.serverGameState);
    }
    await this.executeNextNightHandler();
  }

  async handlePlayerNightAction(action: NightAction, sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (!token || token !== this.awakePlayerId) {
      return this.sendError(sender, "Not your turn");
    }
    if (!this.serverGameState?.currentNightHandler) return;

    const handler = this.serverGameState.currentNightHandler;
    const player = this.state.players.find((p) => p.id === token);
    if (!player) return;

    await dispatchNightAction(
      this.getNightContext(),
      handler,
      player,
      action
    );
  }

  async endNight() {
    this.awakePlayerId = null;

    // Kills were applied immediately when the Imp acted.
    // Collect the names already recorded during the night for the dawn announcement.
    const nightDeaths: string[] = this.serverGameState?.nightDeaths ?? [];

    // Clear nightly states (protected wears off)
    for (const p of this.state.players) {
      p.states = p.states.filter((s) => s !== "protected");
    }

    // Reset per-day nomination flags
    for (const p of this.state.players) {
      if (p.alive) {
        p.ableToNominate = true;
        p.ableToBeNominated = true;
      }
    }

    // ── Win condition check (night kills may finish the game) ──
    // We need to set lastNightDeaths first so the announcement shows even on game-over.
    this.state.lastNightDeaths = nightDeaths;

    await this.storyLogger.logNightEnd(this.state.roundNumber ?? 1, nightDeaths);

    if (await this.applyWinIfOver("endNight")) return;

    this.state.phase = "day";
    this.state.isDay = true;
    // Clear the previous execution info now that we're in a new day
    if (this.serverGameState) {
      this.serverGameState.lastExecutedCharacter = undefined;
      this.serverGameState.lastExecutedRegistration = undefined;
      this.serverGameState.lastExecutedPlayerId = undefined;
    }
    // Start 5-min discussion timer
    const DISCUSSION_MS = 5 * 60 * 1000;
    this.state.dayTimerEndsAt = Date.now() + DISCUSSION_MS;
    // Reset block for new day
    this.state.playersOnBlock = [];
    this.state.blockVoteCounts = {};
    this.state.activeVote = undefined;

    await this.storyLogger.addEvent("phase:transition", {
      from: "night",
      to: "day",
      roundNumber: this.state.roundNumber,
      deaths: nightDeaths,
    });

    await this.persistAndBroadcast();
    console.log(
      `[GAME] Night ${this.state.roundNumber} ended. Transitioning to Day. Deaths: ${nightDeaths.join(", ") || "none"}`
    );

    // Auto-advance to nominations when discussion timer expires
    this.scheduleDayTimer(DISCUSSION_MS, () => this.handleDiscussionTimerEnd());
  }

  // ─── Day phase helpers ───

  private scheduleDayTimer(ms: number, callback: () => Promise<void>) {
    if (this.dayTimerHandle) clearTimeout(this.dayTimerHandle);
    this.dayTimerHandle = setTimeout(() => { callback(); }, ms);
  }

  private scheduleVoteTimer(ms: number, callback: () => Promise<void>) {
    if (this.voteTimerHandle) clearTimeout(this.voteTimerHandle);
    this.voteTimerHandle = setTimeout(() => { callback(); }, ms);
  }

  private async handleDiscussionTimerEnd() {
    if (this.state.phase !== "day") return;
    console.log("[GAME] Discussion timer expired — auto-starting nominations");
    await this.startNominations();
  }

  private async startNominations() {
    const NOM_MS = 5 * 60 * 1000;
    this.state.phase = "nomination";
    this.state.dayTimerEndsAt = Date.now() + NOM_MS;

    await this.storyLogger.addEvent("day:nominationsOpen", {
      roundNumber: this.state.roundNumber,
    });

    await this.persistAndBroadcast();
    this.scheduleDayTimer(NOM_MS, () => this.handleNominationsTimerEnd());
  }

  private async handleNominationsTimerEnd() {
    if (this.state.phase !== "nomination") return;
    console.log("[GAME] Nominations timer expired — going to night");
    await this.executeAndGoToNight();
  }

  // ─── Host day handlers ───

  async handleHostStartNominations(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId)
      return this.sendError(sender, "Only host can start nominations");
    if (this.state.phase !== "day")
      return this.sendError(sender, "Can only start nominations during discussion");
    await this.startNominations();
  }

  handleHostExtendTimer(seconds: number, sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId)
      return this.sendError(sender, "Only host can extend timer");

    const phase = this.state.phase;

    if (phase === "accusation") {
      // Extend accusation/defence timer
      this.state.accusationTimerEndsAt = (this.state.accusationTimerEndsAt ?? Date.now()) + seconds * 1000;
      const remaining = this.state.accusationTimerEndsAt - Date.now();
      this.scheduleDayTimer(Math.max(0, remaining), () => this.handleAccusationTimerEnd());
      this.persistAndBroadcast();
      console.log(`[GAME] Accusation timer extended by ${seconds}s`);
      return;
    }

    if (!this.state.dayTimerEndsAt) return;
    this.state.dayTimerEndsAt += seconds * 1000;
    const remaining = this.state.dayTimerEndsAt - Date.now();

    // Reschedule server timer
    const callback =
      phase === "day"
        ? () => this.handleDiscussionTimerEnd()
        : () => this.handleNominationsTimerEnd();
    this.scheduleDayTimer(Math.max(0, remaining), callback);

    this.persistAndBroadcast();
    console.log(`[GAME] Timer extended by ${seconds}s`);
  }

  async handleHostGoToNight(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId)
      return this.sendError(sender, "Only host can go to night");
    const allowed: string[] = ["day", "nomination", "accusation"];
    if (!allowed.includes(this.state.phase))
      return this.sendError(sender, "Can only go to night from day/nomination phase");
    // If there's a pending nomination, abandon it
    this.state.pendingNomination = undefined;
    this.state.accusationTimerEndsAt = undefined;
    await this.executeAndGoToNight();
  }

  private async executeAndGoToNight() {
    if (this.dayTimerHandle) { clearTimeout(this.dayTimerHandle); this.dayTimerHandle = null; }
    if (this.voteTimerHandle) { clearTimeout(this.voteTimerHandle); this.voteTimerHandle = null; }

    // Execute anyone on the block
    const block = this.state.playersOnBlock ?? [];
    let executedName = "";
    let tiedPlayerNames: string[] = [];
    if (block.length === 1) {
      const executed = this.state.players.find((p) => p.id === block[0]);
      if (executed && executed.alive) {
        executed.alive = false;
        executedName = executed.name;
        this.broadcast({ type: "day:execution", playerName: executed.name });
            await this.storyLogger.logExecution({
          playerName: executed.name,
          character: executed.character!,
        });
        console.log(`[GAME] ${executed.name} (${executed.character}) was executed.`);
        // Record executed character and registration for the Undertaker
        if (this.serverGameState) {
          this.serverGameState.lastExecutedCharacter = executed.character ?? undefined;
          this.serverGameState.lastExecutedRegistration = executed.characterRegistration ?? undefined;
          this.serverGameState.lastExecutedPlayerId = executed.id;
        }

        // ── Saint ability: if Saint (not drunk/poisoned) is executed, evil wins ──
        const isSaint = executed.character === "saint";
        const saintProtected =
          executed.states.includes("drunk") || executed.states.includes("poisoned");
        if (isSaint && !saintProtected) {
          const reason = `${executed.name} was the Saint — evil wins!`;
          console.log(`[GAME] Saint executed! ${reason}`);
                await this.storyLogger.addEvent("game:saintExecuted", {
            playerName: executed.name,
            winner: "evil",
          });
          this.state.winner = "evil";
          this.state.winReason = reason;
          this.state.phase = "ended";
          this.broadcast({ type: "game:over", winner: "evil", reason });
          await this.persistAndBroadcast();
          return;
        }
      }
    } else if (block.length > 1) {
      const tiedNames = block.map(
        (id) => this.state.players.find((p) => p.id === id)?.name ?? id
      );
        await this.storyLogger.logNoExecution(`Tied vote: ${tiedNames.join(" and ")}`);
      console.log(`[GAME] Tied vote — no execution. (${tiedNames.join(" & ")})`);
      tiedPlayerNames = tiedNames;
    } else {
        await this.storyLogger.logNoExecution("No one on block");
      console.log("[GAME] No one on the block — no execution.");
    }

    // Clear day state
    this.state.playersOnBlock = [];
    this.state.blockVoteCounts = {};
    this.state.activeVote = undefined;
    this.state.dayTimerEndsAt = undefined;
    this.state.pendingNomination = undefined;
    this.state.accusationTimerEndsAt = undefined;

    // ── Win condition check (execution may have killed the Imp, or left ≤2 alive) ──
    if (executedName) {
      // Only check when someone was actually executed (Saint already returned early)
      if (await this.applyWinIfOver("executeAndGoToNight")) return;
    } else {
      // No execution — check Mayor special win (3 alive, no execution, functioning Mayor)
      const mayorWin = this.checkMayorNoExecutionWin();
      if (mayorWin) {
        this.state.winner = mayorWin.winner;
        this.state.winReason = mayorWin.reason;
        this.state.phase = "ended";
            await this.storyLogger.addEvent("game:mayorWin", {
          winner: "good",
          reason: mayorWin.reason,
        });
        console.log(`[GAME OVER] ${mayorWin.reason}`);
        this.broadcast({ type: "game:over", winner: "good", reason: mayorWin.reason });
        await this.persistAndBroadcast();
        return;
      }
    }

    // Pause at dusk so the host can show the execution announcement
    this.state.lastExecutedName = executedName; // "" = nobody executed
    this.state.lastExecutedTie = tiedPlayerNames.length > 0 ? tiedPlayerNames : undefined;
    this.state.phase = "dusk";
    console.log(`[GAME] Entering dusk phase (executed: "${executedName || "nobody"}")`);
    await this.persistAndBroadcast();
    // Host must send host:proceedToNight to continue
  }

  async handleHostProceedToNight(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId)
      return this.sendError(sender, "Only the host can proceed to night");
    if (this.state.phase !== "dusk")
      return this.sendError(sender, "Not in dusk phase");

    this.state.lastExecutedName = undefined;
    this.state.lastExecutedTie = undefined;
    await this.beginNightPhase();
  }

  private async beginNightPhase() {
    const nextRound = (this.state.roundNumber ?? 1) + 1;
    this.state.roundNumber = nextRound;
    this.state.phase = "night";
    this.state.isDay = false;
    this.awakePlayerId = null;

    await this.storyLogger.addEvent("phase:transition", {
      from: "day",
      to: "night",
      roundNumber: nextRound,
    });

    await this.persistAndBroadcast();
    await this.startNight();
  }

  // ─── Nomination handlers ───

  async handlePlayerNominate(targetId: string, sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (!token) return;
    if (this.state.phase !== "nomination")
      return this.sendError(sender, "Nominations are not open");

    const nominator = this.state.players.find((p) => p.id === token);
    const nominated = this.state.players.find((p) => p.id === targetId);

    if (!nominator || !nominated) return;
    if (token === targetId) return this.sendError(sender, "You cannot nominate yourself");
    if (!nominator.alive) return this.sendError(sender, "Dead players cannot nominate");
    if (!nominator.ableToNominate)
      return this.sendError(sender, "You have already nominated today");
    if (!nominated.ableToBeNominated)
      return this.sendError(sender, `${nominated.name} has already been nominated today`);
    if (!nominated.alive) return this.sendError(sender, "Cannot nominate a dead player");

    // Mark flags
    nominator.ableToNominate = false;
    nominated.ableToBeNominated = false;

    // Nomination will be logged with vote results in finalizeVote()
    console.log(`[GAME] ${nominator.name} nominated ${nominated.name}`);

    // Virgin ability check (first nomination only)
    if (checkVirginAbility(nominator, nominated)) {
      // Consume the Virgin's one-time ability
      nominated.ability = false;
      // Kill the nominator
      nominator.alive = false;
        await this.storyLogger.logVirginTrigger({
        virginName: nominated.name,
        nominatorName: nominator.name,
        triggered: true,
      });
      console.log(`[GAME] Virgin ability triggered! ${nominator.name} dies.`);
      this.broadcast({
        type: "game:announcement",
        text: `💀 ${nominator.name} mysteriously died.`,
      });
      // Virgin still goes to accusation/vote even though nominator died
      await this.persistAndBroadcast();
    } else if (nominated.character === "virgin" && nominated.ability) {
      // Virgin was nominated but ability didn't trigger (nominator not townsfolk, or drunk/poisoned)
      // Still consume the ability - it only works on the first nomination attempt
      nominated.ability = false;
    }

    // Enter the accusation/defence phase before the vote
    await this.startAccusationPhase(nominator.id, nominated.id);
  }

  // ─── Accusation / defence phase ───

  private async startAccusationPhase(nominatorId: string, nominatedId: string) {
    const nominator = this.state.players.find((p) => p.id === nominatorId)!;
    const nominated = this.state.players.find((p) => p.id === nominatedId)!;

    const ACCUSATION_MS = 5 * 60 * 1000; // 5 minutes
    this.state.phase = "accusation";
    this.state.pendingNomination = {
      nominatorId,
      nominatedId,
      nominatorName: nominator.name,
      nominatedName: nominated.name,
    };
    this.state.accusationTimerEndsAt = Date.now() + ACCUSATION_MS;

    console.log(
      `[GAME] Accusation phase: ${nominator.name} → ${nominated.name}. 5 min timer started.`
    );
    await this.persistAndBroadcast();

    // Auto-start vote when timer expires
    this.scheduleDayTimer(ACCUSATION_MS, () => this.handleAccusationTimerEnd());
  }

  private async handleAccusationTimerEnd() {
    if (this.state.phase !== "accusation") return;
    console.log("[GAME] Accusation timer expired — auto-starting vote");
    await this.beginVoteFromAccusation();
  }

  async handleHostStartVote(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId)
      return this.sendError(sender, "Only the host can start the vote");
    if (this.state.phase !== "accusation")
      return this.sendError(sender, "No pending nomination to vote on");
    await this.beginVoteFromAccusation();
  }

  private async beginVoteFromAccusation() {
    if (!this.state.pendingNomination) return;
    const { nominatorId, nominatedId } = this.state.pendingNomination;
    this.state.pendingNomination = undefined;
    this.state.accusationTimerEndsAt = undefined;
    // Clear any existing day timer (the accusation one)
    if (this.dayTimerHandle) { clearTimeout(this.dayTimerHandle); this.dayTimerHandle = null; }
    await this.startVote(nominatorId, nominatedId);
  }

  private async startVote(nominatorId: string, nominatedId: string) {
    const nominator = this.state.players.find((p) => p.id === nominatorId)!;
    const nominated = this.state.players.find((p) => p.id === nominatedId)!;
    const seating = this.state.seatingOrder ?? this.state.players.map((p) => p.id);

    const voterOrder = buildVoterOrder(seating, nominatedId, this.state.players);

    this.state.activeVote = {
      nominatorId,
      nominatedId,
      nominatorName: nominator.name,
      nominatedName: nominated.name,
      yesVoterIds: [],
      voterOrder,
      currentVoterIndex: 0,
      voteTimerEndsAt: Date.now() + 10_000,
      results: {},
    };

    this.state.phase = "voting";

    this.broadcast({ type: "vote:start", nominatedId, nominatorId });
    await this.persistAndBroadcast();

    console.log(`[GAME] Vote started: ${nominator.name} → ${nominated.name}. Voters: ${voterOrder.length}`);
    await this.advanceVote();
  }

  private async advanceVote() {
    if (!this.state.activeVote) return;
    const vote = this.state.activeVote;

    if (isVotingComplete(vote)) {
      await this.endVoting();
      return;
    }

    const currentVoterId = getCurrentVoter(vote)!;
    const currentVoter = this.state.players.find((p) => p.id === currentVoterId);
    vote.voteTimerEndsAt = Date.now() + 10_000;

    await this.persistAndBroadcast();

    // Notify current voter
    this.sendToToken(currentVoterId, {
      type: "vote:turn",
      playerId: currentVoterId,
      timeRemaining: 10,
    });

    console.log(`[GAME] Waiting for ${currentVoter?.name ?? currentVoterId} to vote (10s)`);

    // Auto-default to "no" after 10 seconds
    this.scheduleVoteTimer(10_000, () => this.handleVoteTimeout(currentVoterId, vote.currentVoterIndex));
  }

  private async handleVoteTimeout(voterId: string, expectedIndex: number) {
    if (!this.state.activeVote) return;
    if (this.state.activeVote.currentVoterIndex !== expectedIndex) return; // already advanced
    if (this.state.phase !== "voting") return;

    const voter = this.state.players.find((p) => p.id === voterId);
    console.log(`[GAME] Vote timeout for ${voter?.name ?? voterId} — defaulting to NO`);
    await this.recordVote(voterId, false);
  }

  async handlePlayerVote(voted: boolean, sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (!token) return;
    if (this.state.phase !== "voting" || !this.state.activeVote)
      return this.sendError(sender, "No active vote");

    const currentVoterId = getCurrentVoter(this.state.activeVote);
    if (token !== currentVoterId)
      return this.sendError(sender, "It is not your turn to vote");

    await this.recordVote(token, voted);
  }

  private async recordVote(voterId: string, voted: boolean) {
    if (!this.state.activeVote) return;
    const vote = this.state.activeVote;

    // Record result
    vote.results[voterId] = voted;
    const voter = this.state.players.find((p) => p.id === voterId);

    // Only track and log YES votes
    if (voted) {
      vote.yesVoterIds.push(voterId);

      // Mark dead voter as having used their dead vote
      if (voter && !voter.alive) {
        voter.deadVoted = true;
      }

      // Log to story - use "deadvote" for dead players voting yes
      const eventType = !voter?.alive ? "day:deadvote" : "day:vote";
      await this.storyLogger.addEvent(eventType, {
        voterName: voter?.name ?? voterId,
        nominatedName: vote.nominatedName,
      });
    }

    // Broadcast result (still broadcast both yes and no for UI)
    this.broadcast({ type: "vote:result", playerId: voterId, voted });

    vote.currentVoterIndex += 1;
    await this.persistAndBroadcast();
    await this.advanceVote();
  }

  private async endVoting() {
    if (!this.state.activeVote) return;
    const vote = this.state.activeVote;

    const yesVotes = vote.yesVoterIds.length;
    const votesNeeded = computeVotesNeeded(
      this.state.players,
      this.state.playersOnBlock ?? [],
      this.state.blockVoteCounts ?? {}
    );
    const onBlock = yesVotes >= votesNeeded;

    // Update block
    const { playersOnBlock, blockVoteCounts } = updateBlock(
      vote.nominatedId,
      yesVotes,
      votesNeeded,
      this.state.playersOnBlock ?? [],
      this.state.blockVoteCounts ?? {}
    );
    this.state.playersOnBlock = playersOnBlock;
    this.state.blockVoteCounts = blockVoteCounts;


    const yesVoterNames = vote.yesVoterIds.map(
      id => this.state.players.find(p => p.id === id)?.name ?? "unknown"
    );
    await this.storyLogger.logNomination({
      nominatorName: vote.nominatorName,
      nominatedName: vote.nominatedName,
      votes: yesVoterNames,
      voteCount: yesVotes,
      votesNeeded,
      putOnBlock: onBlock,
    });

    console.log(
      `[GAME] Vote over: ${vote.nominatedName} got ${yesVotes}/${votesNeeded} votes needed. On block: ${onBlock}`
    );

    this.broadcast({
      type: "vote:end",
      nominatedId: vote.nominatedId,
      yesVotes,
      votesNeeded,
      onBlock,
    });

    // Return to nomination phase
    this.state.activeVote = undefined;
    this.state.phase = "nomination";

    await this.persistAndBroadcast();
  }

  // ─── Slayer handler ───

  async handlePlayerSlay(targetId: string, sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (!token) return;
    const dayPhases = ["day", "nomination", "accusation"] as string[];
    if (!dayPhases.includes(this.state.phase))
      return this.sendError(sender, "Can only slay during the day");

    const slayer = this.state.players.find((p) => p.id === token);
    const target = this.state.players.find((p) => p.id === targetId);

    if (!slayer || !target) return;
    if (slayer.character !== "slayer")
      return this.sendError(sender, "Only the Slayer can use this ability");
    if (!slayer.ability)
      return this.sendError(sender, "You have already used your Slayer ability");
    if (!target.alive) return this.sendError(sender, "Target is already dead");

    // Evaluate ability effectiveness BEFORE consuming it
    const abilityWorks =
      !slayer.states.includes("drunk") &&
      !slayer.states.includes("poisoned");

    // Mark ability used regardless of outcome
    slayer.ability = false;

    // Slayer kills actual demons only (not Recluse who may register as demon)
    if (abilityWorks && target.characterType === "demon") {
      target.alive = false;
      await this.storyLogger.logSlayAttempt({
        slayerName: slayer.name,
        targetName: target.name,
        success: true,
      });
      console.log(`[GAME] Slayer ${slayer.name} slays the Demon ${target.name}!`);
      this.broadcast({
        type: "game:announcement",
        text: `${target.name} died mysteriously.`,
      });

      // ── Win condition: Slayer killed the Demon → Good wins ──
      if (await this.applyWinIfOver("slayerKill")) return;
    } else {
      await this.storyLogger.logSlayAttempt({
        slayerName: slayer.name,
        targetName: target.name,
        success: false,
        reason: !abilityWorks ? "drunk/poisoned" : "not_demon",
      });
      console.log(`[GAME] Slayer ${slayer.name} slays ${target.name} — nothing happens.`);
      // No global announcement on unsuccessful slay - keeps information hidden
    }

    await this.persistAndBroadcast();
  }

  // ─── Mini-game score handler ───

  async handleMiniGameScore(
    night: number,
    game: MiniGameType,
    score: number,
    sender: Party.Connection
  ) {
    const token = this.getTokenForConnection(sender);
    if (!token) return;

    const player = this.state.players.find((p) => p.id === token);
    if (!player) return;

    // Initialize leaderboard if it doesn't exist
    if (!this.state.miniGameLeaderboard) {
      this.state.miniGameLeaderboard = {};
    }

    // Initialize player stats if they don't exist
    if (!this.state.miniGameLeaderboard[token]) {
      this.state.miniGameLeaderboard[token] = {
        playerName: player.name,
        totalScore: 0,
        gameScores: [],
      };
    }

    // Add this night's score
    const entry = this.state.miniGameLeaderboard[token];
    entry.gameScores.push({ night, game, score });
    entry.totalScore += score;

    console.log(
      `[MINIGAME] ${player.name} scored ${score} on ${game} (Night ${night})`
    );

    await this.persistAndBroadcast();
  }

  // ─── Win condition checker ───

  /**
   * Scarlet Woman intercept: if the Imp just died and a Scarlet Woman is alive
   * (not drunk/poisoned) with ≥ 5 players alive, she silently becomes the new
   * demon. Her displayed character stays "scarlet_woman" but her
   * characterRegistration changes to "demon" so she acts as Imp from now on.
   *
   * Returns true if a transition occurred (game continues).
   */
  private async tryScarletWomanIntercept(): Promise<boolean> {
    const alive = this.state.players.filter((p) => p.alive);

    // Only triggers if there is no alive demon right now
    const aliveDemon = alive.find((p) => p.characterRegistration === "demon");
    if (aliveDemon) return false;

    // Official rule: requires ≥ 5 players alive
    if (alive.length < 5) return false;

    // Find an eligible Scarlet Woman (alive, not drunk or poisoned)
    const sw = alive.find(
      (p) =>
        p.character === "scarlet_woman" &&
        !p.states.includes("drunk") &&
        !p.states.includes("poisoned")
    );
    if (!sw) return false;

    // Promote her — she is now the Demon mechanically AND visually
    sw.character = "imp";
    sw.characterRegistration = "demon";

    await this.storyLogger.addEvent("game:scarletWomanIntercept", {
      playerName: sw.name,
    });
    console.log(
      `[GAME] Scarlet Woman ${sw.name} intercepts — she is now the Demon!`
    );

    // Notify the Scarlet Woman privately
    this.sendToToken(sw.id, {
      type: "game:announcement",
      text: "🔱 The Imp has died. You are now the Demon — act as the Imp from now on!",
    });

    // Also tell the other evil players so they know who the new demon is
    for (const p of this.state.players) {
      if (p.alive && p.id !== sw.id && p.characterRegistration === "minion") {
        this.sendToToken(p.id, {
          type: "game:announcement",
          text: `🔱 The Imp has died. ${sw.name} (Scarlet Woman) is now the Demon!`,
        });
      }
    }

    await this.persistState();
    return true;
  }

  /**
   * Check whether either team has won.
   * Call AFTER tryScarletWomanIntercept so promotion is already reflected.
   *
   * Good wins:
   *   - No alive demon
   *   - Mayor ability: 3 players alive with functioning Mayor and no execution
   *
   * Evil wins:
   *   - ≤ 2 players alive with demon (unless Mayor changes threshold to 2)
   */
  private checkWinConditions(): { winner: "good" | "evil"; reason: string } | null {
    const alive = this.state.players.filter((p) => p.alive);
    const aliveDemon = alive.find((p) => p.characterRegistration === "demon");

    // Good wins: demon is dead
    if (!aliveDemon) {
      return {
        winner: "good",
        reason: "The Demon has been slain — Good wins!",
      };
    }

    // Check for functioning Mayor (alive, not drunk, not poisoned)
    const functioningMayor = alive.find(
      (p) =>
        p.character === "mayor" &&
        !p.states.includes("drunk") &&
        !p.states.includes("poisoned")
    );

    // With a functioning Mayor, evil needs to get down to 2 players (not 3)
    // The Mayor keeps the game going at 3 players
    const evilWinThreshold = functioningMayor ? 2 : 2;

    if (alive.length <= evilWinThreshold) {
      // Special case: exactly 3 alive with functioning Mayor - game continues
      // (This is handled by the threshold, but we double-check)
      if (alive.length === 3 && functioningMayor) {
        // Game continues - Mayor keeps it going
        return null;
      }

      return {
        winner: "evil",
        reason: `Only ${alive.length} player${alive.length === 1 ? "" : "s"} remain — Evil wins!`,
      };
    }

    return null;
  }

  /**
   * Check Mayor win condition: if 3 players remain with a functioning Mayor
   * and no execution happens, good wins.
   * Called at the end of a day when going to night with no execution.
   */
  private checkMayorNoExecutionWin(): { winner: "good"; reason: string } | null {
    const alive = this.state.players.filter((p) => p.alive);

    // Must have exactly 3 players alive
    if (alive.length !== 3) return null;

    // Must have a functioning Mayor
    const functioningMayor = alive.find(
      (p) =>
        p.character === "mayor" &&
        !p.states.includes("drunk") &&
        !p.states.includes("poisoned")
    );

    if (!functioningMayor) return null;

    return {
      winner: "good",
      reason: `No execution with 3 players — the Mayor (${functioningMayor.name}) wins for Good!`,
    };
  }

  /**
   * If win conditions are met, transition to the "ended" phase and broadcast
   * game:over. Returns true if the game is over.
   * Runs the Scarlet Woman intercept first (she may absorb the demon role).
   */
  private async applyWinIfOver(context: string): Promise<boolean> {
    // Give the Scarlet Woman a chance to step in before checking wins
    await this.tryScarletWomanIntercept();

    const result = this.checkWinConditions();
    if (!result) return false;

    this.state.winner = result.winner;
    this.state.winReason = result.reason;
    this.state.phase = "ended";

    await this.storyLogger.logGameEnd(result.winner, result.reason);
    console.log(`[GAME OVER] ${result.winner === "good" ? "Good" : "Evil"} wins! ${result.reason} (triggered by: ${context})`);

    this.broadcast({ type: "game:over", winner: result.winner, reason: result.reason });
    await this.persistAndBroadcast();
    return true;
  }

  /** Build a NightContext bridging this server instance to standalone handlers. */
  private getNightContext(): NightContext {
    return {
      state: this.state,
      serverGameState: this.serverGameState!,
      storyLogger: this.storyLogger,
      sendToToken: (token, msg) => this.sendToToken(token, msg),
      addLog: (event, detail) => this.logger.addLog(event, detail),
      logBoth: async (debugEvent, debugDetail, storyDetail) => {
        // Log to debug log
        await this.logger.addLog(debugEvent, debugDetail);
        // Log to story log
        await this.storyLogger.addEvent("night:event" as any, storyDetail);
      },
      persistState: () => this.persistState(),
      persistServerState: () =>
        this.room.storage.put("serverGameState", this.serverGameState),
      setStepPhase: async (phase) => {
        if (this.serverGameState) {
          this.serverGameState.currentStepPhase = phase;
          await this.room.storage.put(
            "serverGameState",
            this.serverGameState
          );
        }
      },
      sleepAndAdvance: (playerId) => this.sleepAndAdvance(playerId),
    };
  }

  /** Send player to sleep and advance to next night step. */
  private async sleepAndAdvance(playerId: string) {
    this.sendToToken(playerId, { type: "player:sleep" });
    this.awakePlayerId = null;
    if (this.serverGameState) {
      this.serverGameState.currentNightHandlerIndex =
        (this.serverGameState.currentNightHandlerIndex ?? 0) + 1;
      this.serverGameState.currentStepPhase = undefined;
      await this.room.storage.put("serverGameState", this.serverGameState);
    }
    await this.executeNextNightHandler();
  }

  /** Persist state without broadcasting (for mid-night state changes). */
  private async persistState() {
    await this.room.storage.put("state", this.state);
  }

  // ─── Player handlers ───

  async handlePlayerJoin(
    name: string,
    token: string,
    sender: Party.Connection
  ) {
    console.log(
      `[JOIN] Player "${name}" (token: ${token}, conn: ${sender.id}) attempting to join`
    );

    // Reconnect: token already has a player
    const existingPlayer = this.state.players.find((p) => p.id === token);
    if (existingPlayer) {
      console.log(
        `[JOIN] Reconnecting "${existingPlayer.name}" with token: ${token}`
      );
      this.registerConnection(token, sender);
      existingPlayer.name = name;

        // Story log: Don't log reconnections, only actual game events

      this.persistAndBroadcast();

      // Re-send character if game has started
      if (existingPlayer.character) {
        this.sendToToken(token, {
          type: "character:reveal",
          character: existingPlayer.character,
          characterType: existingPlayer.characterType!,
        });
      }

      // Re-send demon bluffs if the demon info step has already passed
      if (
        this.serverGameState &&
        this.state.phase !== "waiting" &&
        this.state.phase !== "setup" &&
        existingPlayer.characterRegistration === "demon"
      ) {
        // Check if demon_info has been executed
        const nightOrder = getNightOrder(this.state.roundNumber ?? 1);
        const demonInfoIndex = nightOrder.indexOf("demon_info");
        const demonInfoDone =
          demonInfoIndex === -1 || // demon_info not in this night's order
          (this.serverGameState.currentNightHandlerIndex ?? 0) > demonInfoIndex;

        if (demonInfoDone || this.state.phase !== "night") {
          this.sendToToken(token, {
            type: "demon:bluffs",
            bluffs: this.serverGameState.demonBluffs,
          });
        }
      }
      return;
    }

    // Don't allow new players after game has started
    if (this.state.phase !== "waiting") {
      return this.sendError(sender, "Game has already started");
    }

    // Check room capacity (max 15 players)
    if (this.state.players.length >= 15) {
      console.log(`[JOIN] Rejected - room full (${this.state.players.length}/15)`);
      return this.sendError(sender, "Room full");
    }

    // Check if name is taken
    if (this.state.players.some((p) => p.name === name)) {
      console.log(`[JOIN] Rejected - name taken`);
      return this.sendError(sender, "Name already taken");
    }

    this.registerConnection(token, sender);

    const player: Player = {
      id: token,
      name,
      alive: true,
      character: null,
      trueCharacter: null,
      characterType: null,
      characterRegistration: null,
      states: [],
      ability: true,
      ableToNominate: true,
      ableToBeNominated: true,
      deadVoted: false,
    };

    this.state.players.push(player);

    // Story log: Don't log player joins, only actual game events

    console.log(`[JOIN] Success! Now ${this.state.players.length} players`);
    this.persistAndBroadcast();
  }

  async handlePlayerLeave(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (!token) return;

    const leaving = this.state.players.find((p) => p.id === token);
    this.state.players = this.state.players.filter((p) => p.id !== token);
    this.connectionIdToToken.delete(sender.id);
    this.tokenToConnectionId.delete(token);

    // Story log: Don't log player leaves, only actual game events

    this.persistAndBroadcast();
  }

  // ─── HTTP ───

  async onRequest(req: Party.Request) {
    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };

    if (req.method === "GET") {
      const url = new URL(req.url);

      // GET ?log=true → return debug log (game log)
      if (url.searchParams.get("log") === "true") {
        return new Response(JSON.stringify(this.logger.getLog(), null, 2), {
          status: 200,
          headers: corsHeaders,
        });
      }

      // GET ?logs=true → return debug logs (console logs)
      if (url.searchParams.get("logs") === "true") {
        return new Response(JSON.stringify(this.debugLogger.getLogs(), null, 2), {
          status: 200,
          headers: corsHeaders,
        });
      }

      // GET ?storylog=true → return story log (clean narrative events)
      if (url.searchParams.get("storylog") === "true") {
        return new Response(JSON.stringify(this.storyLogger.getLog(), null, 2), {
          status: 200,
          headers: corsHeaders,
        });
      }

      // GET ?retelling=true → generate AI retelling of the game
      if (url.searchParams.get("retelling") === "true") {
        try {
          const input = buildRetellingInput(
            this.state,
            this.serverGameState,
            this.storyLogger.getLog()
          );

          if (!input) {
            return new Response(
              JSON.stringify({ error: "Game has not ended yet" }),
              { status: 400, headers: corsHeaders }
            );
          }

          // Use host-provided key first, then fall back to environment config
          const aiConfig = this.hostAIConfig ?? detectAIConfig();
          const retelling = await generateRetelling(input, aiConfig);
          return new Response(JSON.stringify(retelling, null, 2), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (error) {
          console.error("[RETELLING] Error generating retelling:", error);

          // Log AI error to debug log
          await this.logger.addLog("ai:retellingError", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            phase: this.state.phase,
            playerCount: this.state.players.length,
          });

          return new Response(
            JSON.stringify({
              error: "Failed to generate retelling",
              details: error instanceof Error ? error.message : String(error)
            }),
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // GET ?slideshow=true → return slideshow retelling (night-by-night)
      // If AI key is available, returns AI narrative + slides. Otherwise returns deterministic slides.
      if (url.searchParams.get("slideshow") === "true") {
        if (this.state.phase !== "ended") {
          return new Response(
            JSON.stringify({ error: "Game has not ended yet" }),
            { status: 400, headers: corsHeaders }
          );
        }

        const { buildSlideshowRetelling } = await import("./slideshow");
        const slideshow = buildSlideshowRetelling(
          this.state,
          this.serverGameState,
          this.storyLogger.getLog()
        );

        // Try to generate AI narrative if API key available
        const aiConfig = this.hostAIConfig ?? detectAIConfig();
        let aiNarrative = null;

        console.log("[SLIDESHOW] hostAIConfig:", this.hostAIConfig ? "set" : "not set");
        console.log("[SLIDESHOW] detectAIConfig result:", aiConfig ? `${aiConfig.provider}` : "null");

        if (aiConfig) {
          try {
            const input = buildRetellingInput(
              this.state,
              this.serverGameState,
              this.storyLogger.getLog()
            );

            console.log("[SLIDESHOW] buildRetellingInput result:", input ? "valid" : "null");

            if (input) {
              console.log(`[SLIDESHOW] Generating AI narrative with ${aiConfig.provider}...`);
              await this.logger.addLog("ai:generating", { provider: aiConfig.provider });
              aiNarrative = await generateRetelling(input, aiConfig);
              console.log("[SLIDESHOW] AI narrative generated successfully");
              await this.logger.addLog("ai:success", { provider: aiConfig.provider });
            } else {
              console.log("[SLIDESHOW] No input - game may not be ended");
              await this.logger.addLog("ai:noInput", { reason: "game may not be ended" });
            }
          } catch (error) {
            console.error("[SLIDESHOW] AI narrative generation failed:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.logger.addLog("ai:error", { error: errorMessage });
            // Continue with deterministic slideshow
          }
        } else {
          console.log("[SLIDESHOW] No AI config available - skipping AI narrative");
          await this.logger.addLog("ai:noConfig", { reason: "no API key configured" });
        }

        // Return combined response with both AI narrative and deterministic slides
        const response = {
          ...slideshow,
          aiNarrative, // null if no AI available or if it failed
        };

        return new Response(JSON.stringify(response, null, 2), {
          status: 200,
          headers: corsHeaders,
        });
      }

      // GET ?grimoire=true → return final grimoire (game must be ended)
      if (url.searchParams.get("grimoire") === "true") {
        if (this.state.phase !== "ended") {
          return new Response(
            JSON.stringify({ error: "Game has not ended yet" }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!this.serverGameState) {
          return new Response(
            JSON.stringify({ error: "No game state available" }),
            { status: 404, headers: corsHeaders }
          );
        }

        // Build grimoire using the same logic as Spy grimoire
        const { buildSpyGrimoire } = await import("./nightSteps");
        const grimoire = buildSpyGrimoire(this.state, this.serverGameState);

        return new Response(JSON.stringify(grimoire, null, 2), {
          status: 200,
          headers: corsHeaders,
        });
      }

      // GET /logs → return HTML viewer showing terminal console.log output
      if (url.pathname.endsWith("/logs")) {
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Game Logs - Room ${this.room.id.toUpperCase()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      padding: 20px;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #fff;
    }
    .subtitle {
      color: #888;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .note {
      background: #1a2332;
      border-left: 3px solid #2563eb;
      padding: 12px 16px;
      margin-bottom: 24px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.6;
    }
    .note strong { color: #60a5fa; }
    .note code {
      background: #0f1419;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      color: #fbbf24;
    }
    .log-panel {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
      min-height: 500px;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 13px;
      line-height: 1.5;
      color: #d1d5db;
    }
    .log-entry {
      border-left: 3px solid #444;
      padding: 12px 16px;
      margin-bottom: 12px;
      background: #0f0f0f;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .log-entry:hover {
      background: #141414;
      border-left-color: #666;
    }
    .log-entry.important {
      border-left-color: #f59e0b;
      background: #1a1108;
    }
    .log-entry.error {
      border-left-color: #ef4444;
      background: #1a0808;
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .log-event {
      font-weight: 600;
      color: #60a5fa;
      font-size: 14px;
    }
    .log-entry.important .log-event {
      color: #fbbf24;
    }
    .log-entry.error .log-event {
      color: #f87171;
    }
    .log-time {
      font-size: 11px;
      color: #666;
      font-family: 'SF Mono', Monaco, monospace;
    }
    .log-detail {
      font-size: 13px;
      color: #9ca3af;
      line-height: 1.6;
    }
    .log-detail strong {
      color: #d1d5db;
      font-weight: 500;
    }
    .log-detail code {
      background: #0a0a0a;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      color: #fbbf24;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #666;
      font-size: 14px;
    }
    .game-state-panel {
      margin-top: 20px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
    }
    .game-state-panel h2 {
      font-size: 18px;
      margin-bottom: 16px;
      color: #fff;
      border-bottom: 1px solid #2a2a2a;
      padding-bottom: 8px;
    }
    .state-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 12px;
    }
    .state-item {
      background: #0f0f0f;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #2a2a2a;
    }
    .state-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
      margin-bottom: 4px;
    }
    .state-value {
      font-size: 16px;
      color: #fff;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Game Logs</h1>
    <div class="subtitle">Room Code: <strong>${this.room.id.toUpperCase()}</strong></div>

    <div class="note">
      <strong>ℹ️ Note:</strong> Logs are output to the terminal via <code>console.log()</code> which is the standard practice for PartyKit/Cloudflare Workers.<br>
      <br>
      <strong>To view logs in real-time:</strong><br>
      1. Check the terminal where <code>pnpm dev:party</code> is running<br>
      2. Look for lines starting with <code>━━━ [GAME LOG]</code>, <code>[GAME]</code>, <code>[JOIN]</code>, <code>[MESSAGE]</code>, etc.<br>
      3. In production, use <code>wrangler tail</code> to stream logs from Cloudflare Workers
    </div>

    <div class="game-state-panel">
      <h2>Current Game State</h2>
      <div class="state-grid">
        <div class="state-item">
          <div class="state-label">Phase</div>
          <div class="state-value">${this.state.phase}</div>
        </div>
        <div class="state-item">
          <div class="state-label">Players</div>
          <div class="state-value">${this.state.players.length}</div>
        </div>
        <div class="state-item">
          <div class="state-label">Round</div>
          <div class="state-value">${this.state.roundNumber ?? 0}</div>
        </div>
        <div class="state-item">
          <div class="state-label">Day/Night</div>
          <div class="state-value">${this.state.isDay ? "Day" : "Night"}</div>
        </div>
      </div>
    </div>

    <div class="game-state-panel">
      <h2>Debug Log</h2>
      <div class="meta" style="margin-bottom: 12px;">
        <div class="count" id="debug-count">Loading...</div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <label class="auto-refresh">
            <input type="checkbox" id="show-verbose" style="margin-right: 4px;">
            Show all events
          </label>
          <label class="auto-refresh">
            <input type="checkbox" id="auto-refresh" checked>
            Auto-refresh (3s)
          </label>
        </div>
      </div>
      <div class="log-panel" style="max-height: 600px; overflow-y: auto;">
        <div id="debug-content">Loading...</div>
      </div>
    </div>

    <div class="game-state-panel">
      <h2>Story Log (for AI Retelling)</h2>
      <div class="meta" style="margin-bottom: 12px;">
        <div class="count" id="story-count">Loading...</div>
      </div>
      <div class="log-panel" style="max-height: 400px; overflow-y: auto;">
        <div id="story-content">Loading...</div>
      </div>
    </div>
  </div>

  <script>
    let refreshInterval = null;
    // PartyKit normalizes room IDs to lowercase, so use lowercase for API calls
    const roomId = '${this.room.id}'.toLowerCase();

    // Important events to show by default (errors, critical game events, AI failures)
    const importantEvents = new Set([
      'game:over',
      'game:error',
      'ai:retellingError',
      'api:keyInvalid',
      'game:saintExecuted',
      'game:mayorWin',
      'game:scarletWomanIntercept',
      'day:virginTriggered',
      'day:slayerKill',
      'day:slayerMiss',
      'day:execution',
      'day:tiedExecution'
    ]);

    const errorEvents = new Set(['ai:retellingError', 'ai:error', 'game:error', 'api:keyInvalid']);

    // Format a log entry into readable HTML
    function formatLogEntry(entry) {
      const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const isImportant = importantEvents.has(entry.event);
      const isError = errorEvents.has(entry.event);
      const className = isError ? 'error' : isImportant ? 'important' : '';

      let detailHTML = formatEventDetail(entry.event, entry.detail);

      return \`
        <div class="log-entry \${className}">
          <div class="log-header">
            <div class="log-event">\${entry.event}</div>
            <div class="log-time">\${time}</div>
          </div>
          <div class="log-detail">\${detailHTML}</div>
        </div>
      \`;
    }

    // Format event details based on event type
    function formatEventDetail(event, detail) {
      switch (event) {
        case 'ai:retellingError':
          return \`❌ <strong>AI Retelling Failed</strong><br>
                 Error: <code>\${detail.error}</code><br>
                 Phase: \${detail.phase}, Players: \${detail.playerCount}\`;

        case 'api:keyValid':
          return \`✅ <strong>API Key Valid</strong><br>
                 Provider: <code>\${detail.provider}</code><br>
                 Key: <code>\${detail.keyPrefix}...</code>\`;

        case 'api:keyInvalid':
          return \`❌ <strong>API Key Invalid</strong><br>
                 Provider: <code>\${detail.provider}</code><br>
                 Key: <code>\${detail.keyPrefix}...</code><br>
                 Reason: \${detail.reason}\`;

        case 'api:keyCleared':
          return \`🗑️ <strong>API Key Cleared</strong><br>
                 Provider: <code>\${detail.provider}</code>\`;

        case 'day:execution':
          return \`⚰️ <strong>\${detail.playerName}</strong> was executed (\${detail.character})\`;

        case 'day:tiedExecution':
          return \`⚖️ <strong>Tied vote</strong> — no execution (\${detail.playerNames})\`;

        case 'day:virginTriggered':
          return \`⚔️ <strong>Virgin ability!</strong> \${detail.nominatorName} dies for nominating \${detail.virginName}\`;

        case 'day:slayerKill':
          return \`🗡️ <strong>Slayer kills Demon!</strong> \${detail.slayerName} → \${detail.targetName}\`;

        case 'day:slayerMiss':
          return \`🗡️ <strong>Slayer misses</strong> — \${detail.slayerName} → \${detail.targetName} (\${detail.reason})\`;

        case 'game:over':
          return \`🎮 <strong>Game Over!</strong> Winner: <code>\${detail.winner}</code><br>
                 Reason: \${detail.reason}\`;

        case 'game:mayorWin':
          return \`👑 <strong>Mayor special win!</strong> \${detail.reason}\`;

        case 'game:saintExecuted':
          return \`✨ <strong>Saint executed!</strong> \${detail.reason}\`;

        case 'game:scarletWomanIntercept':
          return \`💃 <strong>Scarlet Woman becomes Imp!</strong> \${detail.scarletWomanName}\`;

        case 'phase:transition':
          return \`\${detail.from} → <strong>\${detail.to}</strong>\${detail.roundNumber ? \` (Round \${detail.roundNumber})\` : ''}\`;

        case 'player:joined':
        case 'player:reconnected':
          return \`Player: <strong>\${detail.playerName}</strong>\${detail.totalPlayers ? \` (Total: \${detail.totalPlayers})\` : ''}\`;

        case 'game:bagGenerated':
          return \`Generated bag for <strong>\${detail.playerCount} players</strong>\`;

        case 'ai:generating':
          return \`🤖 <strong>Generating AI narrative...</strong><br>
                 Provider: <code>\${detail.provider}</code>\`;

        case 'ai:success':
          return \`✅ <strong>AI narrative generated successfully</strong><br>
                 Provider: <code>\${detail.provider}</code>\`;

        case 'ai:error':
          return \`❌ <strong>AI narrative generation failed</strong><br>
                 Error: <code>\${detail.error}</code>\`;

        case 'ai:noConfig':
          return \`ℹ️ <strong>No AI config available</strong><br>
                 Reason: \${detail.reason}\`;

        case 'ai:noInput':
          return \`⚠️ <strong>Cannot generate AI narrative</strong><br>
                 Reason: \${detail.reason}\`;

        default:
          // Fallback: pretty-print JSON
          return '<pre style="margin:0; font-size:12px;">' + JSON.stringify(detail, null, 2) + '</pre>';
      }
    }

    // Format story log entry
    function formatStoryEntry(entry) {
      const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      let detailHTML = formatStoryDetail(entry.event, entry.detail);

      return \`
        <div class="log-entry">
          <div class="log-header">
            <div class="log-event">\${entry.event}</div>
            <div class="log-time">\${time}</div>
          </div>
          <div class="log-detail">\${detailHTML}</div>
        </div>
      \`;
    }

    // Format story event details based on event type
    function formatStoryDetail(event, detail) {
      switch (event) {
        // Setup events
        case 'room:created':
          return \`🎲 Room <strong>\${detail.roomCode.toUpperCase()}</strong> created\`;

        case 'player:joined':
          return \`👤 <strong>\${detail.playerName}</strong> joined (Total: \${detail.totalPlayers})\`;

        case 'player:reconnected':
          return \`🔄 <strong>\${detail.playerName}</strong> reconnected\`;

        case 'player:left':
          return \`👋 <strong>\${detail.playerName}</strong> left (Total: \${detail.totalPlayers})\`;

        case 'phase:transition':
          return \`⏭️ <strong>\${detail.from}</strong> → <strong>\${detail.to}</strong>\${detail.roundNumber ? \` (Round \${detail.roundNumber})\` : ''}\${detail.deaths?.length ? \`<br>Deaths: \${detail.deaths.join(', ')}\` : ''}\`;

        case 'game:setupStarted':
          return \`🎮 Game setup started (\${detail.playerCount} players)\`;

        case 'game:seatingUpdated':
        case 'game:seatingConfirmed':
          return \`💺 Seating order: \${detail.seatingOrder.join(' → ')}\`;

        case 'game:bagGenerated':
          return \`🎒 Character bag: \${detail.charactersInBag.join(', ')}\`;

        case 'game:nightOrdersBuilt':
          return \`🌙 Night orders built<br>First night: \${detail.firstNightSteps.join(', ')}<br>Other nights: \${detail.otherNightsSteps.join(', ')}\`;

        case 'setup:characters':
          const assignments = detail.assignments;
          let html = '📜 <strong>Character Assignments</strong><br>';
          assignments.forEach(a => {
            const isDrunk = a.character !== a.trueCharacter;
            html += \`• <strong>\${a.playerName}</strong>: \${a.character}\`;
            if (isDrunk) html += \` <span style="color:#f59e0b">(actually \${a.trueCharacter} - drunk)</span>\`;
            html += '<br>';
          });
          return html;

        case 'setup:bluffs':
          return \`🎭 <strong>Demon Bluffs</strong> for <strong>\${detail.demonName}</strong>: \${detail.bluffs.join(', ')}\`;

        case 'setup:redHerring':
          return \`🎯 <strong>Red Herring:</strong> \${detail.playerName}\`;

        // Night events
        case 'night:start':
          return \`🌙 <strong>Night \${detail.nightNumber}</strong> begins\`;

        case 'night:end':
          return \`☀️ <strong>Night \${detail.nightNumber}</strong> ends\${detail.deaths?.length ? \`<br>Deaths: \${detail.deaths.join(', ')}\` : ' (no deaths)'}\`;

        case 'night:minionInfo':
          return \`👹 <strong>\${detail.minionName}</strong> (\${detail.minionCharacter}) learns:<br>Demon: \${detail.demonName}<br>Other minions: \${detail.otherMinions.join(', ') || 'none'}\`;

        case 'night:demonInfo':
          const minionList = detail.minions.map(m => \`\${m.name} (\${m.character})\`).join(', ');
          return \`😈 <strong>\${detail.demonName}</strong> learns:<br>Minions: \${minionList}<br>Bluffs: \${detail.bluffs.join(', ')}\`;

        case 'night:info':
          const drunkPoisonBadge = detail.states?.length > 0 ? \` <span style="color:#f59e0b">[\${detail.states.join(' and ')}]</span>\` : '';
          return \`ℹ️ <strong>\${detail.playerName}</strong> (\${detail.character})\${drunkPoisonBadge}<br>Learned: \${detail.infoShown}\`;

        case 'night:playerAction':
          const actionBadge = detail.states?.length > 0 ? \` <span style="color:#f59e0b">[\${detail.states.join(' and ')}]</span>\` : '';
          return \`⚡ <strong>\${detail.playerName}</strong> (\${detail.character})\${actionBadge}<br>\${detail.action}\${detail.result ? \`<br>Result: \${detail.result}\` : ''}\`;

        case 'night:kill':
          let killMsg = \`💀 <strong>\${detail.killerName}</strong> kills <strong>\${detail.targetName}</strong>\`;
          if (detail.protected) killMsg += ' <span style="color:#10b981">(protected by Monk)</span>';
          if (detail.soldier) killMsg += ' <span style="color:#3b82f6">(Soldier)</span>';
          if (detail.mayorBounce) {
            killMsg += ' <span style="color:#eab308">(Mayor bounce)</span>';
            if (detail.bouncedTo) killMsg += \`<br>💥 Kill bounced to <strong>\${detail.bouncedTo}</strong>\`;
          }
          if (!detail.actuallyDied) killMsg += '<br>❌ Kill failed';
          return killMsg;

        case 'night:protection':
          return \`🛡️ <strong>\${detail.monkName}</strong> protects <strong>\${detail.targetName}</strong>\`;

        case 'night:poison':
          return \`☠️ <strong>\${detail.poisonerName}</strong> poisons <strong>\${detail.targetName}</strong>\`;

        case 'night:starpass':
          return \`⭐ <strong>\${detail.impName}</strong> starpasses to <strong>\${detail.newImpName}</strong>\`;

        case 'night:ravenkeeper':
          const rkCorrect = detail.wasCorrect ? '✅' : '❌';
          return \`🐦 <strong>\${detail.ravenkeeperName}</strong> (Ravenkeeper) checks <strong>\${detail.targetName}</strong><br>Shown: \${detail.revealedCharacter} \${rkCorrect} (actual: \${detail.actualCharacter})\`;

        case 'night:spyGrimoire':
          let grimoireHtml = \`🔍 <strong>\${detail.playerName}</strong> (Spy) sees grimoire:<br>\`;
          detail.grimoire.forEach(e => {
            grimoireHtml += \`• <strong>\${e.playerName}</strong>: \${e.character}\`;
            if (!e.alive) grimoireHtml += ' [dead]';
            if (e.states?.length) grimoireHtml += \` [\${e.states.join(', ')}]\`;
            grimoireHtml += '<br>';
          });
          return grimoireHtml;

        // Day events
        case 'day:nominationsOpen':
          return \`🗳️ Nominations open (Round \${detail.roundNumber})\`;

        case 'day:nomination':
          return \`👉 <strong>\${detail.nominatorName}</strong> nominates <strong>\${detail.nominatedName}</strong>\`;

        case 'day:vote':
          return \`\${detail.voted ? '✅' : '❌'} <strong>\${detail.voterName}</strong> votes \${detail.voted ? 'YES' : 'NO'} on \${detail.nominatedName}\`;

        case 'day:deadvote':
          return \`💀✅ <strong>\${detail.voterName}</strong> uses dead vote on \${detail.nominatedName}\`;

        case 'day:voteResult':
          const onBlockBadge = detail.putOnBlock ? ' <span style="color:#ef4444">[ON BLOCK]</span>' : '';
          return \`📊 Vote complete: <strong>\${detail.nominatedName}</strong>\${onBlockBadge}<br>\${detail.voteCount}/\${detail.votesNeeded} votes<br>Voted yes: \${detail.votes.join(', ') || 'none'}\`;

        case 'day:virginTriggered':
          return '⚔️ <strong>' + detail.virginName + '</strong> (Virgin) triggered!<br><strong>' + detail.nominatorName + '</strong> dies' + (detail.reason ? ' (' + detail.reason + ')' : '');

        case 'day:slay':
          return detail.success
            ? '🗡️ <strong>' + detail.slayerName + '</strong> (Slayer) kills <strong>' + detail.targetName + '</strong>!'
            : '🗡️ <strong>' + detail.slayerName + '</strong> (Slayer) targets <strong>' + detail.targetName + '</strong> — nothing happens' + (detail.reason ? ' (' + detail.reason + ')' : '');

        case 'day:execution':
          return '⚰️ <strong>' + detail.playerName + '</strong> (' + detail.character + ') executed' + (detail.tied ? ' (tied with ' + detail.tiedWith.join(', ') + ')' : '');

        case 'day:noExecution':
          return \`🚫 No execution (\${detail.reason})\`;

        // Game end events
        case 'game:saintExecuted':
          return \`✨ <strong>\${detail.playerName}</strong> (Saint) executed — Evil wins!\`;

        case 'game:mayorWin':
          return \`👑 Mayor win! \${detail.reason}\`;

        case 'game:scarletWomanIntercept':
          return \`💃 <strong>\${detail.playerName}</strong> (Scarlet Woman) becomes the Imp!\`;

        case 'game:end':
          return \`🏁 <strong>Game Over!</strong><br>Winner: <strong>\${detail.winner.toUpperCase()}</strong><br>Reason: \${detail.reason}\`;

        default:
          // Fallback for unknown events
          return '<pre style="margin:0; font-size:12px;">' + JSON.stringify(detail, null, 2) + '</pre>';
      }
    }

    async function loadLogs() {
      try {
        // Debug log
        const debugRes = await fetch(\`/party/\${roomId}?log=true\`);
        const debugLog = await debugRes.json();

        const showVerbose = document.getElementById('show-verbose').checked;
        const filteredLog = showVerbose
          ? debugLog
          : debugLog.filter(entry => importantEvents.has(entry.event));

        document.getElementById('debug-count').textContent =
          debugLog.length === 0
            ? 'No entries'
            : showVerbose
              ? \`\${debugLog.length} entries (all)\`
              : \`\${filteredLog.length}/\${debugLog.length} entries (important only)\`;

        if (filteredLog.length === 0) {
          document.getElementById('debug-content').innerHTML = \`
            <div class="empty-state">
              \${showVerbose
                ? 'No debug log entries yet.<br>Logs will appear here once events occur.'
                : 'No important events yet.<br>Check "Show all events" to see everything.'}
            </div>
          \`;
        } else {
          document.getElementById('debug-content').innerHTML =
            filteredLog.map(formatLogEntry).join('');
        }

        // Story log
        const storyRes = await fetch(\`/party/\${roomId}?storylog=true\`);
        const storyLog = await storyRes.json();
        document.getElementById('story-count').textContent =
          storyLog.length === 0 ? 'No entries' : \`\${storyLog.length} entries\`;
        if (storyLog.length === 0) {
          document.getElementById('story-content').innerHTML = \`
            <div class="empty-state">
              No story log entries yet.<br><br>
              Story log records:<br>
              • Character assignments<br>
              • Night actions with reasons<br>
              • Day nominations and votes<br>
              • Game end
            </div>
          \`;
        } else {
          document.getElementById('story-content').innerHTML =
            storyLog.map(formatStoryEntry).join('');
        }
      } catch (err) {
        console.error('Failed to load logs:', err);
        const errorHTML = '<div class="empty-state" style="color:#ef4444">Error loading logs: ' + err.message + '</div>';
        document.getElementById('debug-content').innerHTML = errorHTML;
        document.getElementById('story-content').innerHTML = errorHTML;
      }
    }

    // Auto-refresh toggle
    document.getElementById('auto-refresh').addEventListener('change', (e) => {
      if (e.target.checked) {
        refreshInterval = setInterval(loadLogs, 3000);
      } else {
        if (refreshInterval) clearInterval(refreshInterval);
      }
    });

    // Verbose toggle - reload immediately when changed
    document.getElementById('show-verbose').addEventListener('change', loadLogs);

    // Initial load
    loadLogs();

    // Start auto-refresh
    refreshInterval = setInterval(loadLogs, 3000);
  </script>
</body>
</html>
        `;
        return new Response(html, {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        });
      }

      // GET ?state=true → return current game state
      if (url.searchParams.get("state") === "true") {
        return new Response(
          JSON.stringify({
            roomState: this.state,
            phase: this.state.phase,
            playerCount: this.state.players.length,
            roundNumber: this.state.roundNumber,
            isDay: this.state.isDay,
          }, null, 2),
          { status: 200, headers: corsHeaders }
        );
      }

      // Default: room existence check
      return new Response(
        JSON.stringify({ exists: this.state.hostId !== null }),
        { status: 200, headers: corsHeaders }
      );
    }
    return new Response("Method not allowed", { status: 405 });
  }

  // ─── Messaging helpers ───

  sendToConnection(connection: Party.Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message));
  }

  sendToToken(token: string, message: ServerMessage) {
    const connectionId = this.tokenToConnectionId.get(token);
    if (!connectionId) return;
    const connection = this.room.getConnection(connectionId);
    if (connection) {
      connection.send(JSON.stringify(message));
    }
  }

  /** Convenience: send an error message to a connection. */
  private sendError(connection: Party.Connection, message: string) {
    this.sendToConnection(connection, { type: "error", message });
  }

  broadcast(message: ServerMessage) {
    this.room.broadcast(JSON.stringify(message));
  }

  async persistAndBroadcast() {
    console.log(
      `[BROADCAST] Broadcasting to all. Players: ${this.state.players.length}, Connections: ${[...this.room.getConnections()].length}`
    );
    await this.room.storage.put("state", this.state);
    this.broadcast({ type: "sync", state: this.state });
  }
}
