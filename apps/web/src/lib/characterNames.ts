import type { Character, CharacterType } from "@ai-botc/game-logic";

// Human-friendly display names
export const CHARACTER_DISPLAY_NAMES: Record<Character, string> = {
  washerwoman: "Washerwoman",
  librarian: "Librarian",
  investigator: "Investigator",
  chef: "Chef",
  empath: "Empath",
  fortune_teller: "Fortune Teller",
  undertaker: "Undertaker",
  monk: "Monk",
  ravenkeeper: "Ravenkeeper",
  virgin: "Virgin",
  slayer: "Slayer",
  soldier: "Soldier",
  mayor: "Mayor",
  butler: "Butler",
  drunk: "Drunk",
  recluse: "Recluse",
  saint: "Saint",
  poisoner: "Poisoner",
  spy: "Spy",
  scarlet_woman: "Scarlet Woman",
  baron: "Baron",
  imp: "Imp",
};

export const CHARACTER_TYPE_DISPLAY: Record<CharacterType, string> = {
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
};

export const CHARACTER_TYPE_COLORS: Record<CharacterType, string> = {
  townsfolk: "text-blue-400",
  outsider: "text-cyan-400",
  minion: "text-orange-400",
  demon: "text-red-500",
};

export const CHARACTER_TYPE_BG: Record<CharacterType, string> = {
  townsfolk: "bg-blue-900/40 border-blue-700",
  outsider: "bg-cyan-900/40 border-cyan-700",
  minion: "bg-orange-900/40 border-orange-700",
  demon: "bg-red-900/40 border-red-700",
};
