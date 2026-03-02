"use client";

import Image from "next/image";
import type { Character, CharacterType } from "@ai-botc/game-logic";
import { getCharacterTokenPath, CHARACTER_DISPLAY_NAMES } from "@/lib/characterNames";

interface CharacterTokenProps {
  character: Character;
  characterType?: CharacterType;
  /** Size in pixels (width and height) */
  size?: number;
  /** Show character name below the token */
  showName?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Displays a character token image with optional name label.
 * 
 * Note: Uses the `character` field (what the player sees), not `trueCharacter`.
 * For Drunk players, this will show the character they think they are, not "drunk".
 */
export default function CharacterToken({
  character,
  characterType,
  size = 80,
  showName = false,
  className = "",
}: CharacterTokenProps) {
  // Use character field (what player sees) for token path, not trueCharacter
  const tokenPath = getCharacterTokenPath(character);
  const displayName = CHARACTER_DISPLAY_NAMES[character];

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div
        className={`relative rounded-full overflow-hidden border-2 bg-gray-900`}
        style={{ width: size, height: size }}
      >
        {tokenPath ? (
          <Image
            src={tokenPath}
            alt={displayName}
            fill
            className="object-cover"
            sizes={`${size}px`}
          />
        ) : (
          // Fallback for characters without tokens
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
            {displayName.charAt(0)}
          </div>
        )}
      </div>
      {showName && (
        <p className="mt-1 text-xs text-gray-400 text-center max-w-[80px] truncate">
          {displayName}
        </p>
      )}
    </div>
  );
}
