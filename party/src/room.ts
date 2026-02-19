import type * as Party from "partykit/server";
import type {
  ClientMessage,
  ServerMessage,
  RoomState,
  Player,
  ServerGameState,
  GameLogEntry,
  NightAction,
} from "@ai-botc/game-logic";
import {
  generateBag,
  assignCharacters,
  generateDemonBluffs,
  pickFortuneTellerRedHerring,
} from "@ai-botc/game-logic";

import { GameLogger } from "./gameLog";
import {
  buildNightOrders,
  generateNightSteps,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RoomServer — PartyKit durable-object server for one game room.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default class RoomServer implements Party.Server {
  readonly room: Party.Room;

  /** Shared state broadcast to all clients. */
  state: RoomState;

  /** Server-only game state (never broadcast to clients). */
  serverGameState: ServerGameState | null = null;

  /** Structured game logger. */
  logger!: GameLogger;

  /** Who is currently awake during night (server-only). */
  awakePlayerId: string | null = null;

  /** Server-side timer handles (not persisted — fine for local dev). */
  private dayTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private voteTimerHandle: ReturnType<typeof setTimeout> | null = null;

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

  handleHostCreate(token: string, sender: Party.Connection) {
    console.log(`[HOST] Registering host with token: ${token}`);
    this.registerConnection(token, sender);
    this.state.hostId = token;
    if (this.state.phase === undefined) {
      this.state.phase = "waiting";
    }
    this.logger.addLog("room:created", {
      hostToken: token,
      roomCode: this.state.gameJoinCode,
    });
    this.persistAndBroadcast();
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

    // Generate character bag and assign to players
    console.log(
      `[GAME] Generating bag for ${this.state.players.length} players`
    );
    const bag = generateBag(this.state.players.length);

    await this.logger.addLog("game:bagGenerated", {
      playerCount: this.state.players.length,
      charactersInBag: bag.assignments.map((a) => a.character),
      charactersNotInPlay: bag.notInPlay,
      drunkDisguisedAs: bag.drunkAs,
    });

    const actualCharacters = assignCharacters(this.state.players, bag);

    await this.logger.addLog("game:charactersAssigned", {
      assignments: this.state.players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        seenCharacter: p.character,
        seenType: p.characterType,
        actualRegistration: p.characterRegistration,
        isDrunk: p.states.includes("drunk"),
      })),
    });

    // Generate demon bluffs and fortune teller red herring
    const demonBluffs = generateDemonBluffs(bag.notInPlay);
    const fortuneTellerRedHerring = pickFortuneTellerRedHerring(
      this.state.players
    );

    await this.logger.addLog("game:demonBluffsGenerated", { demonBluffs });

    if (fortuneTellerRedHerring) {
      const redHerringPlayer = this.state.players.find(
        (p) => p.id === fortuneTellerRedHerring
      );
      await this.logger.addLog("game:fortuneTellerRedHerring", {
        playerId: fortuneTellerRedHerring,
        playerName: redHerringPlayer?.name ?? "unknown",
      });
    }

    // Build pre-computed night orders from the assigned characters
    const nightOrders = buildNightOrders(this.state.players);

    // Store server-only state
    this.serverGameState = {
      demonBluffs,
      fortuneTellerRedHerring,
      actualCharacters,
      firstNightOrder: nightOrders.firstNightOrder,
      otherNightsOrder: nightOrders.otherNightsOrder,
    };

    // Initialize seating order (default: join order, host will rearrange)
    this.state.seatingOrder = this.state.players.map((p) => p.id);
    this.state.roundNumber = 0;
    this.state.phase = "setup";

    await this.logger.addLog("phase:transition", {
      from: "waiting",
      to: "setup",
    });

    this.persistAndBroadcast();

    // Send each player their character individually
    for (const player of this.state.players) {
      this.sendToToken(player.id, {
        type: "character:reveal",
        character: player.character!,
        characterType: player.characterType!,
      });
    }

    await this.logger.addLog("game:nightOrdersBuilt", {
      firstNightSteps: nightOrders.firstNightOrder.map((s) => ({
        handler: s.handler,
        playerName: s.playerName,
        character: s.character,
      })),
      otherNightsSteps: nightOrders.otherNightsOrder.map((s) => ({
        handler: s.handler,
        playerName: s.playerName,
        character: s.character,
      })),
    });

    // Persist server game state (demon bluffs revealed during first night)
    await this.room.storage.put("serverGameState", this.serverGameState);
    console.log(
      `[GAME] Characters assigned. Night orders built. Bluffs stored, will reveal at night start.`
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
    this.logger.addLog("game:seatingUpdated", {
      seatingOrder: seatingWithNames,
    });

    this.persistAndBroadcast();
  }

  async handleConfirmSeating(sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (token !== this.state.hostId) {
      return this.sendError(sender, "Only the host can confirm seating");
    }
    if (this.state.phase !== "setup") {
      return this.sendError(sender, "Can only confirm seating during setup");
    }

    const seatingWithNames = (this.state.seatingOrder ?? []).map((id) => {
      const player = this.state.players.find((p) => p.id === id);
      return { playerId: id, playerName: player?.name ?? "unknown" };
    });

    await this.logger.addLog("game:seatingConfirmed", {
      seatingOrder: seatingWithNames,
    });

    // Transition to night phase
    this.state.phase = "night";
    this.state.roundNumber = 1;
    this.state.isDay = false;
    this.awakePlayerId = null;

    await this.logger.addLog("phase:transition", {
      from: "setup",
      to: "night",
      roundNumber: 1,
    });

    await this.persistAndBroadcast();
    await this.startNight();
  }

  // ─── Night orchestration ───

  async startNight() {
    if (!this.serverGameState) return;

    const steps = generateNightSteps(this.state, this.serverGameState);
    this.serverGameState.nightSteps = steps;
    this.serverGameState.currentNightStepIndex = 0;
    this.serverGameState.currentStepPhase = undefined;
    this.serverGameState.nightDeaths = [];
    await this.room.storage.put("serverGameState", this.serverGameState);

    await this.logger.addLog("night:started", {
      nightNumber: this.state.roundNumber,
      totalSteps: steps.length,
      steps: steps.map((s) => ({
        handler: s.handler,
        playerName: s.playerName,
        character: s.character,
      })),
    });

    await this.executeNextNightStep();
  }

  async executeNextNightStep() {
    if (!this.serverGameState?.nightSteps) return;

    const index = this.serverGameState.currentNightStepIndex ?? 0;
    const steps = this.serverGameState.nightSteps;

    if (index >= steps.length) {
      await this.endNight();
      return;
    }

    const step = steps[index];
    const player = this.state.players.find((p) => p.id === step.playerId);

    // Characters that still act even when dead (e.g. Ravenkeeper — not yet implemented)
    const WAKES_WHEN_DEAD: string[] = ["ravenkeeper"];

    if (!player || (!player.alive && !WAKES_WHEN_DEAD.includes(step.handler))) {
      // Player gone or died earlier this night — skip their step
      this.serverGameState.currentNightStepIndex = index + 1;
      await this.executeNextNightStep();
      return;
    }

    this.awakePlayerId = step.playerId;
    const prompted = await dispatchNightStep(
      this.getNightContext(),
      step,
      player
    );

    if (!prompted) {
      // Unknown handler — skip to next step automatically
      this.awakePlayerId = null;
      this.serverGameState.currentNightStepIndex = index + 1;
      this.serverGameState.currentStepPhase = undefined;
      await this.room.storage.put("serverGameState", this.serverGameState);
      await this.executeNextNightStep();
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

    await this.logger.addLog("night:playerAcknowledged", {
      playerId: token,
      playerName: player?.name ?? "unknown",
    });

    this.awakePlayerId = null;
    if (this.serverGameState) {
      this.serverGameState.currentNightStepIndex =
        (this.serverGameState.currentNightStepIndex ?? 0) + 1;
      this.serverGameState.currentStepPhase = undefined;
      await this.room.storage.put("serverGameState", this.serverGameState);
    }
    await this.executeNextNightStep();
  }

  async handlePlayerNightAction(action: NightAction, sender: Party.Connection) {
    const token = this.getTokenForConnection(sender);
    if (!token || token !== this.awakePlayerId) {
      return this.sendError(sender, "Not your turn");
    }
    if (!this.serverGameState?.nightSteps) return;

    const step =
      this.serverGameState.nightSteps[
        this.serverGameState.currentNightStepIndex ?? 0
      ];
    if (!step) return;
    const player = this.state.players.find((p) => p.id === step.playerId);
    if (!player) return;

    await dispatchNightAction(
      this.getNightContext(),
      step,
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
    if (await this.applyWinIfOver("endNight")) return;

    this.state.phase = "day";
    this.state.isDay = true;
    // Clear the previous execution info now that we're in a new day
    if (this.serverGameState) {
      this.serverGameState.lastExecutedCharacter = undefined;
    }
    // Start 5-min discussion timer
    const DISCUSSION_MS = 5 * 60 * 1000;
    this.state.dayTimerEndsAt = Date.now() + DISCUSSION_MS;
    // Reset block for new day
    this.state.playersOnBlock = [];
    this.state.blockVoteCounts = {};
    this.state.activeVote = undefined;

    await this.logger.addLog("phase:transition", {
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

    await this.logger.addLog("day:nominationsOpen", {
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
        await this.logger.addLog("day:execution", { playerName: executed.name, character: executed.character });
        console.log(`[GAME] ${executed.name} (${executed.character}) was executed.`);
        // Record executed character for the Undertaker
        if (this.serverGameState) {
          this.serverGameState.lastExecutedCharacter = executed.character ?? undefined;
        }

        // ── Saint ability: if Saint (not drunk/poisoned) is executed, evil wins ──
        const isSaint = executed.character === "saint";
        const saintProtected =
          executed.states.includes("drunk") || executed.states.includes("poisoned");
        if (isSaint && !saintProtected) {
          const reason = `${executed.name} was the Saint — evil wins!`;
          console.log(`[GAME] Saint executed! ${reason}`);
          await this.logger.addLog("game:saintExecuted", {
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
      await this.logger.addLog("day:tiedExecution", { playerNames: tiedNames.join(" and ") });
      console.log(`[GAME] Tied vote — no execution. (${tiedNames.join(" & ")})`);
      tiedPlayerNames = tiedNames;
    } else {
      await this.logger.addLog("day:noExecution", {});
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

    await this.logger.addLog("phase:transition", {
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

    await this.logger.addLog("day:nomination", {
      nominatorName: nominator.name,
      nominatedName: nominated.name,
    });
    console.log(`[GAME] ${nominator.name} nominated ${nominated.name}`);

    // Virgin ability check
    if (checkVirginAbility(nominator, nominated)) {
      nominator.alive = false;
      await this.logger.addLog("day:virginTriggered", {
        nominatorName: nominator.name,
        nominatedName: nominated.name,
      });
      console.log(`[GAME] Virgin ability triggered! ${nominator.name} dies.`);
      this.broadcast({
        type: "game:announcement",
        text: `⚔️ ${nominated.name} is the Virgin! ${nominator.name} was struck down for nominating them.`,
      });
      // Nomination cancelled — no vote
      await this.persistAndBroadcast();
      return;
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
    if (voted) vote.yesVoterIds.push(voterId);

    // Mark dead voter as having used their dead vote
    const voter = this.state.players.find((p) => p.id === voterId);
    if (voter && !voter.alive) voter.deadVoted = true;

    // Broadcast result
    this.broadcast({ type: "vote:result", playerId: voterId, voted });
    await this.logger.addLog("day:vote", {
      voterName: voter?.name ?? voterId,
      voted,
      nominatedName: vote.nominatedName,
    });

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

    await this.logger.addLog("day:voteResult", {
      nominatorName: vote.nominatorName,
      nominatedName: vote.nominatedName,
      yesVotes,
      votesNeeded,
      onBlock,
      blockAfter: playersOnBlock.map(
        (id) => this.state.players.find((p) => p.id === id)?.name ?? id
      ),
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

    if (abilityWorks && target.characterRegistration === "demon") {
      target.alive = false;
      await this.logger.addLog("day:slayerKill", {
        slayerName: slayer.name,
        targetName: target.name,
      });
      console.log(`[GAME] Slayer ${slayer.name} slays the Demon ${target.name}!`);
      this.broadcast({
        type: "game:announcement",
        text: `🗡️ ${slayer.name} uses the Slayer ability on ${target.name}! ${target.name} is dead!`,
      });

      // ── Win condition: Slayer killed the Demon → Good wins ──
      if (await this.applyWinIfOver("slayerKill")) return;
    } else {
      await this.logger.addLog("day:slayerMiss", {
        slayerName: slayer.name,
        targetName: target.name,
        reason: !abilityWorks ? "drunk/poisoned" : "not_demon",
      });
      console.log(`[GAME] Slayer ${slayer.name} slays ${target.name} — nothing happens.`);
      this.broadcast({
        type: "game:announcement",
        text: `🗡️ ${slayer.name} uses the Slayer ability on ${target.name}… nothing happens.`,
      });
    }

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

    await this.logger.addLog("game:scarletWomanIntercept", {
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
   * Evil wins:  ≤ 2 players alive AND at least one alive demon.
   * Good wins:  No alive demon.
   */
  private checkWinConditions(): { winner: "good" | "evil"; reason: string } | null {
    const alive = this.state.players.filter((p) => p.alive);
    const aliveDemon = alive.find((p) => p.characterRegistration === "demon");

    if (!aliveDemon) {
      return {
        winner: "good",
        reason: "The Demon has been slain — Good wins!",
      };
    }

    if (alive.length <= 2) {
      return {
        winner: "evil",
        reason: `Only ${alive.length} player${alive.length === 1 ? "" : "s"} remain — Evil wins!`,
      };
    }

    return null;
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

    await this.logger.addLog("game:over", {
      winner: result.winner,
      reason: result.reason,
      context,
    });
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
      sendToToken: (token, msg) => this.sendToToken(token, msg),
      addLog: (event, detail) => this.logger.addLog(event, detail),
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
      this.serverGameState.currentNightStepIndex =
        (this.serverGameState.currentNightStepIndex ?? 0) + 1;
      this.serverGameState.currentStepPhase = undefined;
      await this.room.storage.put("serverGameState", this.serverGameState);
    }
    await this.executeNextNightStep();
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

      await this.logger.addLog("player:reconnected", {
        playerId: token,
        playerName: name,
      });

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
        const demonInfoDone =
          (this.serverGameState.currentNightStepIndex ?? 0) >
          (this.serverGameState.nightSteps?.findIndex(
            (s) => s.handler === "demon_info"
          ) ?? -1);
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
      characterType: null,
      characterRegistration: null,
      states: [],
      ability: true,
      ableToNominate: true,
      ableToBeNominated: true,
      deadVoted: false,
    };

    this.state.players.push(player);

    await this.logger.addLog("player:joined", {
      playerId: token,
      playerName: name,
      totalPlayers: this.state.players.length,
    });

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

    await this.logger.addLog("player:left", {
      playerId: token,
      playerName: leaving?.name ?? "unknown",
      totalPlayers: this.state.players.length,
    });

    this.persistAndBroadcast();
  }

  // ─── HTTP ───

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      const url = new URL(req.url);

      // GET ?log=true → return game log
      if (url.searchParams.get("log") === "true") {
        return new Response(JSON.stringify(this.logger.getLog(), null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Default: room existence check
      return new Response(
        JSON.stringify({ exists: this.state.hostId !== null }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
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
