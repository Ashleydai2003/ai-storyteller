/**
 * dayPhase.ts — Pure helpers for day-phase logic (nominations, voting, slayer).
 *
 * All functions are pure (no side-effects) so they can be tested independently.
 */

import type { Player, ActiveVote } from "@ai-botc/game-logic";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Voting helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build the clockwise voter order starting with the player immediately
 * clockwise from the nominated player.
 * Eligible voters: alive players + dead players who haven't used deadVote.
 */
export function buildVoterOrder(
  seatingOrder: string[],
  nominatedId: string,
  players: Player[]
): string[] {
  const nomIdx = seatingOrder.indexOf(nominatedId);
  const startIdx = nomIdx === -1 ? 0 : (nomIdx + 1) % seatingOrder.length;

  // Rotate seating to start from startIdx
  const rotated = [
    ...seatingOrder.slice(startIdx),
    ...seatingOrder.slice(0, startIdx),
  ];

  return rotated.filter((id) => {
    const p = players.find((pl) => pl.id === id);
    if (!p) return false;
    if (p.alive) return true;
    if (!p.deadVoted) return true; // dead player who still has their dead vote
    return false;
  });
}

/**
 * Compute the minimum yes-votes needed for the nominated player to go
 * on the block (or replace the current block holder).
 * Base threshold = ceil(alive / 2).
 * If someone is already on the block with X votes, need X + 1 to replace them.
 */
export function computeVotesNeeded(
  players: Player[],
  playersOnBlock: string[],
  blockVoteCounts: Record<string, number>
): number {
  const aliveCount = players.filter((p) => p.alive).length;
  const base = Math.ceil(aliveCount / 2);

  if (playersOnBlock.length === 0) return base;

  // The player on the block with the most votes sets the bar.
  // Matching their count causes a tie (both end up on the block);
  // beating it replaces them. Either way the threshold is maxBlockVotes,
  // NOT maxBlockVotes + 1 (which would silently swallow a tie).
  const maxBlockVotes = Math.max(
    ...playersOnBlock.map((id) => blockVoteCounts[id] ?? 0)
  );
  return Math.max(base, maxBlockVotes);
}

/**
 * After a vote ends, update the block with the new result.
 * Returns updated { playersOnBlock, blockVoteCounts }.
 *
 * Tie logic: only the CURRENT block holders and the newly nominated player
 * compete. We deliberately ignore historical nominees who are no longer on
 * the block, which prevents stale vote-counts from creating phantom ties.
 */
export function updateBlock(
  nominatedId: string,
  yesVotes: number,
  votesNeeded: number,
  currentBlock: string[],
  currentCounts: Record<string, number>
): { playersOnBlock: string[]; blockVoteCounts: Record<string, number> } {
  if (yesVotes < votesNeeded) {
    // Didn't meet threshold — block unchanged
    return { playersOnBlock: currentBlock, blockVoteCounts: currentCounts };
  }

  // Persist the new vote count for the nominee
  const newCounts = { ...currentCounts, [nominatedId]: yesVotes };

  // Only consider current-block holders + this nominee when deciding who's on block.
  // Historical nominees who were replaced are NOT reconsidered.
  const candidates = [...currentBlock, nominatedId];
  const candidateCounts = Object.fromEntries(
    candidates.map((id) => [id, newCounts[id] ?? 0])
  );
  const maxVotes = Math.max(...Object.values(candidateCounts));
  const newBlock = candidates.filter((id) => candidateCounts[id] === maxVotes);

  // Deduplicate (nominatedId may already be in currentBlock if somehow re-run)
  const uniqueBlock = [...new Set(newBlock)];

  return { playersOnBlock: uniqueBlock, blockVoteCounts: newCounts };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Nomination validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns true if the Virgin ability triggers:
 * nominated is the Virgin (not drunk/poisoned) AND nominator is a townsfolk
 * registration (not drunk/poisoned).
 */
export function checkVirginAbility(
  nominator: Player,
  nominated: Player
): boolean {
  if (nominated.character !== "virgin") return false;
  if (nominated.states.includes("drunk") || nominated.states.includes("poisoned"))
    return false;
  if (nominator.characterRegistration !== "townsfolk") return false;
  if (nominator.states.includes("drunk") || nominator.states.includes("poisoned"))
    return false;
  return true;
}

/**
 * Returns true if the Slayer ability would work:
 * slayer is alive, has ability, is not drunk/poisoned.
 */
export function canSlayerUseAbility(slayer: Player): boolean {
  if (!slayer.alive) return false;
  if (!slayer.ability) return false;
  if (slayer.states.includes("drunk") || slayer.states.includes("poisoned"))
    return false;
  return true;
}

/**
 * Returns the index of the nominated player's position in seating order,
 * modulo length — used for vote-order display.
 */
export function nominatedSeatIndex(
  seatingOrder: string[],
  nominatedId: string
): number {
  return seatingOrder.indexOf(nominatedId);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vote state helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getCurrentVoter(vote: ActiveVote): string | null {
  return vote.voterOrder[vote.currentVoterIndex] ?? null;
}

export function isVotingComplete(vote: ActiveVote): boolean {
  return vote.currentVoterIndex >= vote.voterOrder.length;
}
