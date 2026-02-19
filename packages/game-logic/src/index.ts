// Export all types
export * from "./types";

// Export character utilities (includes PLAYER_DISTRIBUTION)
export * from "./characters";

// Canonical night wake order — includes special meta-steps.
// Characters not in play are simply skipped at runtime.

export const FIRST_NIGHT_ORDER = [
  "minion_info",     // Special: minions learn demon identity (7+ players)
  "demon_info",      // Special: demon learns minions + bluffs
  "poisoner",
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune_teller",
  "butler",
  "spy",
] as const;

export const OTHER_NIGHT_ORDER = [
  "poisoner",
  "monk",
  // "scarlet_woman", // TODO
  "imp",             // Resolved by registration (handles starpass)
  // "ravenkeeper",   // TODO
  "empath",
  "fortune_teller",
  "undertaker",
  "butler",
  "spy",
] as const;

// Generate a random room code
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
