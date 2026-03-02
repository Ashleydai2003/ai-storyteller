import type { GameLogEntry } from "@ai-botc/game-logic";

// ─── Storage interface (matches PartyKit room.storage) ───

interface LogStorage {
  put(key: string, value: unknown): Promise<void>;
}

// ─── GameLogger ───
// Append-only persistent game log with structured console output.

export class GameLogger {
  private log: GameLogEntry[];
  private storage: LogStorage;

  constructor(storage: LogStorage, initialLog: GameLogEntry[] = []) {
    this.log = initialLog;
    this.storage = storage;
  }

  getLog(): GameLogEntry[] {
    return this.log;
  }

  /** Append an entry to the persistent game log and print to server console. */
  async addLog(event: string, detail: Record<string, unknown> = {}): Promise<void> {
    const entry: GameLogEntry = {
      timestamp: new Date().toISOString(),
      event,
      detail,
    };
    this.log.push(entry);
    await this.storage.put("gameLog", this.log);

    // Pretty-print to server console for easy debugging
    const ts = entry.timestamp.split("T")[1]?.replace("Z", "") ?? entry.timestamp;
    console.log(`\n━━━ [GAME LOG] ${event} ━━━ (${ts})`);
    this.printLogDetail(event, detail);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }

  /** Human-readable console output for each log event. */
  private printLogDetail(event: string, detail: Record<string, unknown>) {
    switch (event) {
      case "room:created":
        console.log(`  Room code: ${detail.roomCode}`);
        console.log(`  Host token: ${detail.hostToken}`);
        break;

      case "player:joined":
      case "player:reconnected":
      case "player:left":
        console.log(`  Player: "${detail.playerName}" (${detail.playerId})`);
        if (detail.totalPlayers !== undefined) {
          console.log(`  Total players: ${detail.totalPlayers}`);
        }
        break;

      case "game:bagGenerated": {
        const chars = detail.charactersInBag as string[];
        const notInPlay = detail.charactersNotInPlay as string[];
        console.log(`  Player count: ${detail.playerCount}`);
        console.log(`  Characters IN PLAY (${chars.length}):`);
        chars.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
        console.log(
          `  Characters NOT in play (${notInPlay.length}): ${notInPlay.join(", ")}`
        );
        if (detail.drunkDisguisedAs) {
          console.log(`  Drunk disguised as: ${detail.drunkDisguisedAs}`);
        }
        break;
      }

      case "game:charactersAssigned": {
        const assignments = detail.assignments as Array<{
          playerName: string;
          seenCharacter: string;
          seenType: string;
          actualRegistration: string;
          isDrunk: boolean;
        }>;
        console.log(`  Assignments:`);
        for (const a of assignments) {
          const drunk = a.isDrunk ? " ★ DRUNK" : "";
          console.log(
            `    ${a.playerName.padEnd(15)} → ${a.seenCharacter} (sees: ${a.seenType}, actual: ${a.actualRegistration})${drunk}`
          );
        }
        break;
      }

      case "game:demonBluffsGenerated": {
        const bluffs = detail.demonBluffs as string[];
        console.log(`  Demon bluffs: ${bluffs.join(", ")}`);
        break;
      }

      case "game:demonBluffsRevealed": {
        const bluffs = detail.demonBluffs as string[];
        const recipients = detail.revealedTo as Array<{ playerName: string }>;
        console.log(`  Demon bluffs revealed: ${bluffs.join(", ")}`);
        console.log(
          `  Revealed to: ${recipients.map((r) => r.playerName).join(", ")}`
        );
        break;
      }

      case "game:fortuneTellerRedHerring":
        console.log(
          `  Red herring: "${detail.playerName}" (${detail.playerId})`
        );
        break;

      case "phase:transition":
        console.log(`  ${detail.from} → ${detail.to}`);
        if (detail.roundNumber !== undefined) {
          console.log(`  Round: ${detail.roundNumber}`);
        }
        break;

      case "game:seatingUpdated":
      case "game:seatingConfirmed": {
        const seats = detail.seatingOrder as Array<{ playerName: string }>;
        console.log(`  Seating (${seats.length} players):`);
        seats.forEach((s, i) => console.log(`    ${i + 1}. ${s.playerName}`));
        break;
      }

      case "game:nightOrdersBuilt": {
        const first = detail.firstNightSteps as Array<{
          handler: string;
          playerName: string;
          character: string;
        }>;
        const other = detail.otherNightsSteps as Array<{
          handler: string;
          playerName: string;
          character: string;
        }>;
        console.log(`  First night order (${first.length} steps):`);
        first.forEach((s, i) =>
          console.log(
            `    ${i + 1}. [${s.handler}] ${s.playerName} (${s.character})`
          )
        );
        console.log(`  Other nights order (${other.length} steps):`);
        other.forEach((s, i) =>
          console.log(
            `    ${i + 1}. [${s.handler}] ${s.playerName} (${s.character})`
          )
        );
        break;
      }

      case "night:started": {
        const steps = detail.steps as Array<{
          handler: string;
          playerName: string;
          character: string;
        }>;
        console.log(`  Night ${detail.nightNumber} — ${steps.length} steps:`);
        steps.forEach((s, i) =>
          console.log(
            `    ${i + 1}. [${s.handler}] ${s.playerName} (${s.character})`
          )
        );
        break;
      }

      case "night:minionInfo":
        console.log(
          `  Minion: "${detail.minionName}" (${detail.minionCharacter})`
        );
        console.log(`  Told demon is: "${detail.demonName}"`);
        if ((detail.otherMinions as string[]).length > 0) {
          console.log(
            `  Other minions: ${(detail.otherMinions as string[]).join(", ")}`
          );
        }
        break;

      case "night:demonInfo": {
        const minions = detail.minions as Array<{
          name: string;
          character: string;
        }>;
        console.log(`  Demon: "${detail.demonName}"`);
        console.log(
          `  Told minions: ${minions.map((m) => `${m.name} (${m.character})`).join(", ")}`
        );
        console.log(`  Bluffs: ${(detail.bluffs as string[]).join(", ")}`);
        break;
      }

      case "night:playerAcknowledged":
        console.log(
          `  Player: "${detail.playerName}" acknowledged and went back to sleep`
        );
        break;

      // ── Night info characters (info-only wakes) ──
      case "night:washerwoman":
      case "night:librarian":
      case "night:investigator":
      case "night:chef":
      case "night:empath":
      case "night:spy":
        console.log(`  Player: "${detail.playerName}" woke up`);
        console.log(`  Shown: ${detail.instruction}`);
        if (detail.count !== undefined) console.log(`  Count: ${detail.count}`);
        if (detail.isDrunkOrPoisoned) console.log(`  ⚠ Drunk/Poisoned → info may be false`);
        break;

      // ── Night choice characters (choose a target) ──
      case "night:poisonerWake":
      case "night:fortuneTellerWake":
      case "night:butlerWake":
      case "night:monkWake":
      case "night:impWake":
        console.log(`  Player: "${detail.playerName}" woke up`);
        console.log(`  Prompt: ${detail.instruction}`);
        if (detail.options) console.log(`  Options: ${(detail.options as string[]).join(", ")}`);
        break;

      // ── Night resolver actions (what the player chose) ──

      case "night:poisonerAction":
        console.log(`  "${detail.playerName}" chose to poison: "${detail.targetName}"`);
        console.log(`  Effective: ${detail.effective}`);
        break;

      case "night:fortuneTellerResult":
        console.log(`  "${detail.playerName}" chose: ${(detail.targets as string[]).join(", ")}`);
        console.log(`  Result shown: ${detail.instruction}`);
        if (detail.isDrunkOrPoisoned) console.log(`  ⚠ Drunk/Poisoned → result may be false`);
        break;

      case "night:butlerAction":
        console.log(`  "${detail.butlerName}" chose master: "${detail.masterName}"`);
        break;

      case "night:monkAction":
        console.log(`  "${detail.playerName}" chose to protect: "${detail.targetName}"`);
        console.log(`  Effective: ${detail.effective}`);
        break;

      case "night:impKill":
        console.log(`  "${detail.playerName}" chose to kill: "${detail.targetName}"`);
        break;

      case "night:impStarpass":
        console.log(`  "${detail.impName}" killed themselves → starpass to "${detail.newImpName}"`);
        break;

      case "night:impSuicide":
        console.log(`  "${detail.impName}" killed themselves (no minions alive → suicide)`);
        break;

      case "night:killPrevented":
        console.log(`  Kill on "${detail.targetName}" prevented: ${detail.reason}`);
        break;

      case "night:playerDied":
        console.log(`  "${detail.targetName}" died during the night`);
        break;

      // ── Day phase ──

      case "day:nominationsOpen":
        console.log(`  Round ${detail.roundNumber} — nominations are now open`);
        break;

      case "day:nomination":
        console.log(`  "${detail.nominatorName}" nominated "${detail.nominatedName}"`);
        break;

      case "day:virginTriggered":
        console.log(`  ⚔️  Virgin ability! "${detail.nominatorName}" dies for nominating "${detail.nominatedName}"`);
        break;

      case "day:vote":
        console.log(`  "${detail.voterName}" voted ${detail.voted ? "YES ✓" : "NO ✗"} (nominated: "${detail.nominatedName}")`);
        break;

      case "day:voteResult":
        console.log(`  Vote: "${detail.nominatedName}" — ${detail.yesVotes}/${detail.votesNeeded} votes needed`);
        console.log(`  On block: ${detail.onBlock ? "YES" : "NO"}. Block: [${(detail.blockAfter as string[]).join(", ")}]`);
        break;

      case "day:execution":
        console.log(`  ⚰️  "${detail.playerName}" was executed`);
        break;

      case "day:tiedExecution":
        console.log(`  ⚖️  Tied vote — no execution. (${detail.playerNames})`);
        break;

      case "day:noExecution":
        console.log(`  No one was on the block — no execution`);
        break;

      case "day:slayerKill":
        console.log(`  🗡️  Slayer "${detail.slayerName}" kills Demon "${detail.targetName}"!`);
        break;

      case "day:slayerMiss":
        console.log(`  🗡️  Slayer "${detail.slayerName}" targets "${detail.targetName}" — no effect (${detail.reason})`);
        break;

      default:
        // Fallback: pretty-print the JSON
        console.log(
          `  ${JSON.stringify(detail, null, 2).replace(/\n/g, "\n  ")}`
        );
    }
  }
}
