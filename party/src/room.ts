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
    this.serverGameState.pendingKills = [];
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
    if (!player) {
      // Player gone — skip
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

    // Resolve pending kills (from Imp action)
    if (this.serverGameState?.pendingKills) {
      for (const killId of this.serverGameState.pendingKills) {
        const target = this.state.players.find((p) => p.id === killId);
        if (target && target.alive) {
          if (target.states.includes("protected")) {
            await this.logger.addLog("night:killPrevented", {
              targetName: target.name,
              reason: "protected",
            });
          } else if (
            target.character === "soldier" &&
            !target.states.includes("drunk") &&
            !target.states.includes("poisoned")
          ) {
            await this.logger.addLog("night:killPrevented", {
              targetName: target.name,
              reason: "soldier",
            });
          } else {
            target.alive = false;
            await this.logger.addLog("night:playerDied", {
              targetName: target.name,
            });
          }
        }
      }
      this.serverGameState.pendingKills = [];
    }

    // Clear nightly states (protected wears off)
    for (const p of this.state.players) {
      p.states = p.states.filter((s) => s !== "protected");
    }

    this.state.phase = "day";
    this.state.isDay = true;

    await this.logger.addLog("phase:transition", {
      from: "night",
      to: "day",
      roundNumber: this.state.roundNumber,
    });

    await this.persistAndBroadcast();
    console.log(
      `[GAME] Night ${this.state.roundNumber} ended. Transitioning to Day.`
    );
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
