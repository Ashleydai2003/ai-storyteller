/**
 * Prompts for game retelling generation.
 */

import type { GameRetellingInput } from "../types.js";

/**
 * Build the system prompt for game retelling.
 */
export function buildRetellingSystemPrompt(): string {
  return `You are the Storyteller for Blood on the Clocktower, a masterful narrator weaving tales of deception, deduction, and dramatic reveals in a gothic village haunted by a demon.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GAME OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Blood on the Clocktower is a social deduction game where Good (Townsfolk + Outsiders) battles Evil (Demon + Minions):

**Structure:**
- Alternating Night/Day cycles over multiple rounds
- Night: Characters wake in a specific order to use abilities (information, protection, poisoning, killing)
- Day: Public discussion, nominations, voting, and possible executions
- Dead players can vote ONCE per game (the "dead vote")

**Win Conditions:**
- Good wins: Execute the Demon OR Slayer kills the Demon
- Evil wins: Only 2 players alive (Imp + 1) OR Mayor bounces final kill to good player
- Special: Virgin nominates Townsfolk → Townsfolk dies; Imp kills themselves → Starpass to Minion

**Key Mechanics:**
- Drunk: Thinks they're a Townsfolk but is actually the Drunk (gets false info)
- Poisoned: Gets false information while poisoned
- Red Herring (Fortune Teller): Always registers as Demon to Fortune Teller
- Recluse: May register as Evil/Demon to Good abilities
- Monk protection: Prevents demon kill that night
- Soldier: Immune to Demon kill

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STORYTELLING PHILOSOPHY (from BOTC Wiki)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. CREATE DRAMA & TENSION**
   - Emphasize turning points: close votes, shocking executions, dramatic reveals
   - Build suspense around misinformation: when drunk/poisoned players trusted false info
   - Highlight "if only" moments: near-misses, votes that were off by one
   - Show the impact of key deaths: when the Empath died, Good lost their eyes

**2. FOCUS ON THE HUMAN STORY**
   - Players, not mechanics: "Sarah's brilliant deduction" not "the Investigator got info"
   - Show player emotions: doubt, confidence, betrayal, redemption
   - Highlight social dynamics: who trusted whom, alliances, betrayals
   - Quote memorable player moments when available

**3. EMPHASIZE DECEPTION & DEDUCTION**
   - Evil's cunning: How the Demon stayed hidden, Poisoner's strategic targets
   - Good's detective work: Connecting clues, catching lies, logical deductions
   - Misinformation impact: How drunk/poisoned/red herring shaped the narrative
   - The fog of war: What players believed vs. what was true

**4. CELEBRATE CLEVER PLAYS**
   - Highlight MVP moments: clutch dead votes, perfect Slayer shots, brilliant bluffs
   - Show strategic depth: sacrificial plays, information trades, misdirection
   - Recognize both sides: Evil's deception AND Good's deduction deserve praise
   - Note role-specific excellence: Fortune Teller tracking, Monk saves, Virgin baits

**5. MAINTAIN GOTHIC ATMOSPHERE**
   - Use evocative language: "dawn broke over the village square," "shadows deepened"
   - Frame abilities as supernatural: "visions in the night," "cursed with false sight"
   - Death is dramatic: "fell to the demon's touch," "met their end on the gallows"
   - The village as character: fearful, desperate, haunted, eventually triumphant/doomed

**6. STRUCTURE FOR IMPACT**
   - Opening: Set the scene, introduce the threat, hint at the scale
   - Rising action: Early deaths, key information, growing suspicion
   - Climax: The crucial vote/execution that decided everything
   - Resolution: How it ended, what might have been, who the heroes were

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO INCLUDE (PRIORITY ORDER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ALWAYS mention:**
✓ Misinformation that shaped the game (drunk, poisoned, red herring)
✓ The final execution/kill that ended the game
✓ Virgin triggers and Slayer attempts (huge dramatic moments)
✓ Close calls on executing evil players
✓ Clutch dead votes that swung the outcome
✓ Starpass moments (Imp suicide → transfer)

**Often include:**
✓ Early deaths that removed key players
✓ Successful or failed Monk protections
✓ Ravenkeeper reveals (information from beyond the grave)
✓ Fortune Teller tracking patterns
✓ Poisoner's strategic choices

**Mention if significant:**
✓ Tie votes and how they were resolved
✓ Players who championed the right/wrong suspect
✓ Trust betrayed or vindicated
✓ Information that went ignored or unshared

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON (no markdown formatting):

{
  "narrative": "2-3 SHORT paragraphs maximum. First paragraph: opening atmosphere + key early events. Second paragraph: turning point + climax. Optional third: resolution. Be CONCISE - aim for 150 words total, not more than 200.",
  "highlights": [
    "2-3 one-sentence key moments",
    "Night 2: Ravenkeeper revealed the Demon's identity",
    "Day 3: Clutch dead vote swung execution"
  ],
  "notablePlays": [
    "1-2 standout player contributions with player name",
    "Emma's Fortune Teller tracking narrowed suspects",
    "The Imp's Empath bluff kept them alive"
  ]
}

**CRITICAL:** Be BRIEF and PUNCHY. Focus only on the most dramatic moments. Skip minor details. Get to the point quickly.`;
}

/**
 * Build the user prompt with game data for retelling.
 */
export function buildRetellingUserPrompt(input: GameRetellingInput): string {
  const { gameLog, characterAssignments, winner, winReason, playerCount, roundCount } = input;

  // Format character assignments for the prompt
  const assignmentsText = characterAssignments
    .map((a) => {
      const drunkNote = a.wasDrunk ? " (was secretly the Drunk)" : "";
      return `- ${a.playerName}: ${a.character} (${a.characterType})${drunkNote}`;
    })
    .join("\n");

  // Extract key events from the log
  const keyEvents = extractKeyEvents(gameLog);

  return `Please create a dramatic retelling of this Blood on the Clocktower game.

GAME SUMMARY:
- Players: ${playerCount}
- Rounds played: ${roundCount}
- Winner: ${winner === "good" ? "Good (the Town)" : "Evil (the Demon and Minions)"}
- How it ended: ${winReason}

CHARACTER ASSIGNMENTS (revealed at game end):
${assignmentsText}

KEY EVENTS (chronological):
${keyEvents}

Create an engaging narrative that tells the story of this game from the village's perspective, weaving together the key moments into a cohesive dramatic tale. Remember to output valid JSON.`;
}

/**
 * Extract key events from the game log for the retelling prompt.
 */
function extractKeyEvents(log: any[]): string {
  const events: string[] = [];
  let currentPhase = "";
  let nightNumber = 0;
  let dayNumber = 0;

  for (const entry of log) {
    const detail = entry.detail || {};

    // Track phase changes
    if (entry.event === "night:start") {
      nightNumber = detail.nightNumber || nightNumber + 1;
      currentPhase = `Night ${nightNumber}`;
      events.push(`\n━━━ ${currentPhase} ━━━`);
    } else if (entry.event === "day:start") {
      dayNumber = detail.dayNumber || dayNumber + 1;
      currentPhase = `Day ${dayNumber}`;
      events.push(`\n━━━ ${currentPhase} ━━━`);
    }

    // Format events based on type
    switch (entry.event) {
      // Night events
      case "night:info":
        if (detail.states && detail.states.length > 0) {
          events.push(`⚠️  ${detail.playerName} (${detail.character}) received FALSE info while ${detail.states.join(" & ")}: "${detail.infoShown}"`);
        } else {
          events.push(`ℹ️  ${detail.playerName} (${detail.character}): "${detail.infoShown}"`);
        }
        break;

      case "night:kill":
        if (detail.actuallyDied) {
          events.push(`💀 DEATH: ${detail.killerName} killed ${detail.targetName}`);
        } else if (detail.protected) {
          events.push(`🛡️  ${detail.targetName} was protected by Monk (survived)`);
        } else if (detail.soldier) {
          events.push(`⚔️  ${detail.targetName} (Soldier) immune to demon kill`);
        }
        break;

      case "night:poison":
        events.push(`☠️  ${detail.poisonerName} poisoned ${detail.targetName}`);
        break;

      case "night:starpass":
        events.push(`⭐ STARPASS: ${detail.impName} killed themselves, transferring Demon to ${detail.newImpName}`);
        break;

      case "night:ravenkeeper":
        if (detail.wasCorrect) {
          events.push(`🐦 Ravenkeeper ${detail.ravenkeeperName} learned ${detail.targetName} = ${detail.actualCharacter} (correct)`);
        } else {
          events.push(`🐦 Ravenkeeper ${detail.ravenkeeperName} shown ${detail.revealedCharacter} for ${detail.targetName} (actually ${detail.actualCharacter})`);
        }
        break;

      // Day events
      case "day:nomination":
        const voteStatus = detail.putOnBlock ? `ON BLOCK (${detail.voteCount}/${detail.votesNeeded})` : `Failed (${detail.voteCount}/${detail.votesNeeded})`;
        events.push(`⚖️  ${detail.nominatorName} nominated ${detail.nominatedName} → ${voteStatus}`);
        break;

      case "day:virgin":
        if (detail.triggered) {
          events.push(`👼 VIRGIN TRIGGER: ${detail.nominatorName} (Townsfolk) nominated ${detail.virginName} (Virgin) → ${detail.nominatorName} died`);
        } else {
          events.push(`👼 Virgin ability failed: ${detail.reason}`);
        }
        break;

      case "day:slay":
        if (detail.success) {
          events.push(`⚔️  SLAYER KILL: ${detail.slayerName} successfully slayed ${detail.targetName} (was Demon!)`);
        } else {
          events.push(`⚔️  SLAYER MISS: ${detail.slayerName} tried to slay ${detail.targetName} → ${detail.reason}`);
        }
        break;

      case "day:execution":
        const tieInfo = detail.tied ? ` (tied with ${detail.tiedWith?.join(", ")})` : "";
        events.push(`🪓 EXECUTION: ${detail.playerName}${tieInfo}`);
        break;

      case "day:deadvote":
        events.push(`💀 Dead vote: ${detail.voterName} voted on ${detail.nominatedName}`);
        break;

      case "day:noExecution":
        events.push(`No execution: ${detail.reason}`);
        break;
    }
  }

  return events.join("\n");
}

/**
 * Format a single log event for the prompt.
 */
function formatLogEvent(entry: import("@ai-botc/game-logic").GameLogEntry): string {
  const d = entry.detail;

  switch (entry.event) {
    case "night:playerDied":
      return `DEATH: ${d.targetName} was killed during the night`;

    case "night:impStarpass":
      return `STARPASS: The Imp ${d.impName} killed themselves, passing the demon to ${d.newImpName}`;

    case "night:impSuicide":
      return `SUICIDE: The Imp ${d.impName} killed themselves with no minions left`;

    case "night:ravenkeeperResult":
      return `RAVENKEEPER: ${d.playerName} (killed tonight) used their ability to learn that ${d.targetName} is the ${d.revealedCharacter}`;

    case "day:nomination":
      return `NOMINATION: ${d.nominatorName} nominated ${d.nominatedName}`;

    case "day:virginTriggered":
      return `VIRGIN TRIGGERED: ${d.nominatorName} died for nominating the Virgin ${d.nominatedName}`;

    case "day:voteResult":
      return `VOTE: ${d.nominatedName} received ${d.yesVotes}/${d.votesNeeded} votes (${d.onBlock ? "on the block" : "not enough"})`;

    case "day:execution":
      return `EXECUTION: ${d.playerName} was executed by the town`;

    case "day:tiedExecution":
      return `TIE: ${d.playerNames} tied - no execution`;

    case "day:noExecution":
      return `NO EXECUTION: No one was on the block today`;

    case "day:slayerKill":
      return `SLAYER KILL: ${d.slayerName} used their ability to kill the Demon ${d.targetName}!`;

    case "day:slayerMiss":
      return `SLAYER MISS: ${d.slayerName} tried to slay ${d.targetName} but nothing happened`;

    case "game:over":
      return `GAME OVER: ${d.winner} wins - ${d.reason}`;

    default:
      return `${entry.event}: ${JSON.stringify(d)}`;
  }
}
