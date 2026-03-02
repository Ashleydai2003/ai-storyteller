/**
 * Client-side state store for room and player data.
 *
 * Combines two sources of truth:
 * - `roomState`: Synced from server via WebSocket (shared state)
 * - Player-specific fields: Set from targeted server messages (private to this client)
 */
import { create } from "zustand";
import type {
  RoomState,
  Player,
  Character,
  CharacterType,
  WakePrompt,
} from "@ai-botc/game-logic";

interface RoomStore {
  // Connection state
  roomCode: string | null;
  isHost: boolean;
  playerId: string | null;
  playerName: string | null;

  // Room state (synced from server)
  roomState: RoomState | null;

  // Player-specific state (from targeted server messages)
  revealedCharacter: Character | null;
  revealedCharacterType: CharacterType | null;
  demonBluffs: Character[] | null;

  // Night state (wake/sleep)
  wakePrompt: WakePrompt | null;

  // Actions
  setRoomCode: (code: string) => void;
  setIsHost: (isHost: boolean) => void;
  setPlayerId: (id: string) => void;
  setPlayerName: (name: string | null) => void;
  syncRoomState: (state: RoomState) => void;
  setRevealedCharacter: (character: Character, characterType: CharacterType) => void;
  setDemonBluffs: (bluffs: Character[]) => void;
  setWakePrompt: (prompt: WakePrompt | null) => void;
  reset: () => void;
}

const initialState = {
  roomCode: null,
  isHost: false,
  playerId: null,
  playerName: null,
  roomState: null,
  revealedCharacter: null,
  revealedCharacterType: null,
  demonBluffs: null,
  wakePrompt: null,
};

// Stable empty array to avoid creating new references
const EMPTY_PLAYERS: Player[] = [];

export const useRoomStore = create<RoomStore>((set) => ({
  ...initialState,

  setRoomCode: (code) => set({ roomCode: code }),
  setIsHost: (isHost) => set({ isHost }),
  setPlayerId: (id) => set({ playerId: id }),
  setPlayerName: (name) => set({ playerName: name }),
  syncRoomState: (state) => set({ roomState: state }),
  setRevealedCharacter: (character, characterType) =>
    set({ revealedCharacter: character, revealedCharacterType: characterType }),
  setDemonBluffs: (bluffs) => set({ demonBluffs: bluffs }),
  setWakePrompt: (prompt) => set({ wakePrompt: prompt }),
  reset: () => set(initialState),
}));

/**
 * Selector helpers - return stable references to avoid infinite re-renders.
 * Use these with useRoomStore(selectX) pattern.
 */
export const selectPlayers = (state: RoomStore): Player[] =>
  state.roomState?.players ?? EMPTY_PLAYERS;

export const selectPhase = (state: RoomStore) =>
  state.roomState?.phase ?? "waiting";

export const selectCurrentPlayer = (state: RoomStore): Player | undefined =>
  state.roomState?.players.find((p) => p.id === state.playerId);
