"use client";

import { useMemo } from "react";
import Image from "next/image";
import type { Character, CharacterType } from "@ai-botc/game-logic";
import {
  ALL_TOWNSFOLK,
  ALL_OUTSIDERS,
  ALL_MINIONS,
  ALL_DEMONS,
  PLAYER_DISTRIBUTION,
} from "@ai-botc/game-logic";
import {
  CHARACTER_DISPLAY_NAMES,
  getCharacterTokenPath,
} from "@/lib/characterNames";

interface CharacterSelectionProps {
  playerCount: number;
  selectedCharacters: Character[];
  onToggle: (character: Character) => void;
}

interface CharacterSlotInfo {
  townsfolk: { selected: number; max: number };
  outsiders: { selected: number; max: number };
  minions: { selected: number; max: number };
  demons: { selected: number; max: number };
}

/**
 * Character selection panel for the host during setup.
 * Allows selecting characters within distribution constraints.
 */
export default function CharacterSelection({
  playerCount,
  selectedCharacters,
  onToggle,
}: CharacterSelectionProps) {
  // Get distribution for player count
  const dist = PLAYER_DISTRIBUTION[playerCount];

  // Check if Baron is selected (affects outsider/townsfolk count)
  const hasBaronSelected = selectedCharacters.includes("baron");

  // Calculate adjusted distribution
  const adjustedDist = useMemo(() => {
    if (!dist) return null;
    let { townsfolk, outsiders, minions } = dist;

    if (hasBaronSelected) {
      outsiders = Math.min(outsiders + 2, ALL_OUTSIDERS.length);
      townsfolk = playerCount - outsiders - minions - 1;
    }

    return { townsfolk, outsiders, minions, demons: 1 };
  }, [dist, hasBaronSelected, playerCount]);

  // Count selected by type
  const slotInfo: CharacterSlotInfo = useMemo(() => {
    const selectedTownsfolk = selectedCharacters.filter((c) =>
      (ALL_TOWNSFOLK as readonly string[]).includes(c)
    ).length;
    const selectedOutsiders = selectedCharacters.filter((c) =>
      (ALL_OUTSIDERS as readonly string[]).includes(c)
    ).length;
    const selectedMinions = selectedCharacters.filter((c) =>
      (ALL_MINIONS as readonly string[]).includes(c)
    ).length;
    const selectedDemons = selectedCharacters.filter((c) =>
      (ALL_DEMONS as readonly string[]).includes(c)
    ).length;

    return {
      townsfolk: { selected: selectedTownsfolk, max: adjustedDist?.townsfolk ?? 0 },
      outsiders: { selected: selectedOutsiders, max: adjustedDist?.outsiders ?? 0 },
      minions: { selected: selectedMinions, max: adjustedDist?.minions ?? 0 },
      demons: { selected: selectedDemons, max: adjustedDist?.demons ?? 1 },
    };
  }, [selectedCharacters, adjustedDist]);

  // Check if a character can be selected
  const canSelect = (character: Character, type: CharacterType): boolean => {
    if (selectedCharacters.includes(character)) return true; // Can always deselect

    const info = slotInfo[type === "townsfolk" ? "townsfolk" :
                          type === "outsider" ? "outsiders" :
                          type === "minion" ? "minions" : "demons"];
    return info.selected < info.max;
  };

  if (!dist || !adjustedDist) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        Invalid player count
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Distribution summary */}
      <div className="flex justify-center gap-3 mb-4 text-xs">
        <SlotBadge label="Townsfolk" info={slotInfo.townsfolk} color="blue" />
        <SlotBadge label="Outsiders" info={slotInfo.outsiders} color="cyan" />
        <SlotBadge label="Minions" info={slotInfo.minions} color="orange" />
        <SlotBadge label="Demons" info={slotInfo.demons} color="red" />
      </div>

      {/* Character grid */}
      <div className="space-y-4">
        <CharacterRow
          title="Townsfolk"
          characters={ALL_TOWNSFOLK}
          type="townsfolk"
          selectedCharacters={selectedCharacters}
          onToggle={onToggle}
          canSelect={(c) => canSelect(c, "townsfolk")}
          color="blue"
        />
        <CharacterRow
          title="Outsiders"
          characters={ALL_OUTSIDERS}
          type="outsider"
          selectedCharacters={selectedCharacters}
          onToggle={onToggle}
          canSelect={(c) => canSelect(c, "outsider")}
          color="cyan"
        />
        <CharacterRow
          title="Minions"
          characters={ALL_MINIONS}
          type="minion"
          selectedCharacters={selectedCharacters}
          onToggle={onToggle}
          canSelect={(c) => canSelect(c, "minion")}
          color="orange"
        />
        <CharacterRow
          title="Demon"
          characters={ALL_DEMONS}
          type="demon"
          selectedCharacters={selectedCharacters}
          onToggle={onToggle}
          canSelect={(c) => canSelect(c, "demon")}
          color="red"
        />
      </div>

      {/* Note about Baron */}
      {hasBaronSelected && (
        <p className="text-xs text-orange-400 text-center mt-3">
          Baron selected: +2 Outsiders, -2 Townsfolk
        </p>
      )}
    </div>
  );
}

// Slot badge showing selected/max count
function SlotBadge({
  label,
  info,
  color,
}: {
  label: string;
  info: { selected: number; max: number };
  color: "blue" | "cyan" | "orange" | "red";
}) {
  const isFull = info.selected >= info.max;
  const bgColors = {
    blue: isFull ? "bg-blue-700" : "bg-gray-700",
    cyan: isFull ? "bg-cyan-700" : "bg-gray-700",
    orange: isFull ? "bg-orange-700" : "bg-gray-700",
    red: isFull ? "bg-red-700" : "bg-gray-700",
  };

  return (
    <div className={`${bgColors[color]} rounded-full px-2 py-0.5`}>
      <span className="text-gray-300">{label}:</span>{" "}
      <span className={isFull ? "text-white font-semibold" : "text-gray-400"}>
        {info.selected}/{info.max}
      </span>
    </div>
  );
}

// Row of character tokens
function CharacterRow({
  title,
  characters,
  type,
  selectedCharacters,
  onToggle,
  canSelect,
  color,
}: {
  title: string;
  characters: readonly Character[];
  type: CharacterType;
  selectedCharacters: Character[];
  onToggle: (c: Character) => void;
  canSelect: (c: Character) => boolean;
  color: "blue" | "cyan" | "orange" | "red";
}) {
  const textColors = {
    blue: "text-blue-400",
    cyan: "text-cyan-400",
    orange: "text-orange-400",
    red: "text-red-400",
  };

  return (
    <div>
      <h3 className={`text-xs font-semibold ${textColors[color]} uppercase tracking-wider mb-2`}>
        {title}
      </h3>
      <div className="flex flex-wrap gap-2 justify-center">
        {characters.map((character) => (
          <SelectableToken
            key={character}
            character={character}
            type={type}
            isSelected={selectedCharacters.includes(character)}
            canSelect={canSelect(character)}
            onToggle={() => onToggle(character)}
          />
        ))}
      </div>
    </div>
  );
}

// Individual selectable token
function SelectableToken({
  character,
  type,
  isSelected,
  canSelect,
  onToggle,
}: {
  character: Character;
  type: CharacterType;
  isSelected: boolean;
  canSelect: boolean;
  onToggle: () => void;
}) {
  const tokenPath = getCharacterTokenPath(character);
  const displayName = CHARACTER_DISPLAY_NAMES[character];
  const disabled = !canSelect && !isSelected;

  const borderColors = {
    townsfolk: isSelected ? "border-blue-400 ring-2 ring-blue-400/50" : "border-gray-600",
    outsider: isSelected ? "border-cyan-400 ring-2 ring-cyan-400/50" : "border-gray-600",
    minion: isSelected ? "border-orange-400 ring-2 ring-orange-400/50" : "border-gray-600",
    demon: isSelected ? "border-red-400 ring-2 ring-red-400/50" : "border-gray-600",
  };

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        flex flex-col items-center p-1 rounded-lg transition-all
        ${disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-700/50 cursor-pointer"}
        ${isSelected ? "bg-gray-700/30" : ""}
      `}
      title={displayName}
    >
      <div
        className={`
          relative rounded-full overflow-hidden border-2 bg-gray-900
          ${borderColors[type]}
          transition-all
        `}
        style={{ width: 60, height: 60 }}
      >
        {tokenPath ? (
          <Image
            src={tokenPath}
            alt={displayName}
            fill
            className="object-cover"
            sizes="44px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
            {displayName.charAt(0)}
          </div>
        )}
        {isSelected && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <span className="text-white text-lg">✓</span>
          </div>
        )}
      </div>
      <span className="text-[10px] text-gray-400 mt-0.5 max-w-[50px] truncate text-center">
        {displayName}
      </span>
    </button>
  );
}
