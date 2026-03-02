/**
 * Shared utilities for circular seating/selection components.
 *
 * All circular UI components (seating, player select, grimoire, nominations)
 * use the same layout logic: players arranged in a circle with positions
 * computed from angles. This module centralizes that logic.
 */

/**
 * Ring dimensions based on player count.
 * Larger rings for more players to avoid overlap.
 */
export interface RingSize {
  /** Total container width/height in pixels */
  container: number;
  /** Radius of the circle where players are placed */
  radius: number;
}

/**
 * Compute ring dimensions based on player count.
 * Returns progressively larger rings as player count increases.
 */
export function computeRingSize(playerCount: number): RingSize {
  if (playerCount <= 6) return { container: 320, radius: 110 };
  if (playerCount <= 9) return { container: 380, radius: 140 };
  if (playerCount <= 12) return { container: 440, radius: 170 };
  return { container: 500, radius: 200 };
}

/**
 * Get initials from a player name (max 2 chars).
 * "John Doe" → "JD", "Alice" → "AL"
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Compute (x, y) position for a player at a given index in a circle.
 *
 * @param index - Player's position in seating order (0-based)
 * @param total - Total number of players
 * @param radius - Circle radius in pixels
 * @param center - Center point (assumes square container)
 * @returns { x, y } position in pixels
 */
export function computeSeatPosition(
  index: number,
  total: number,
  radius: number,
  center: number
): { x: number; y: number } {
  // Start from top (-π/2) and go clockwise
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}
