"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePartySocket } from "@/hooks/usePartySocket";
import { useRoomStore, selectPlayers, selectPhase } from "@/stores/roomStore";
import type { RoomState, ServerMessage, NightAction } from "@ai-botc/game-logic";
import {
  CHARACTER_DISPLAY_NAMES,
  CHARACTER_TYPE_DISPLAY,
  CHARACTER_TYPE_COLORS,
  CHARACTER_TYPE_BG,
} from "@/lib/characterNames";
import CircularPlayerSelect from "@/components/CircularPlayerSelect";
import CircularGrimoire from "@/components/CircularGrimoire";
import CircularNominations from "@/components/CircularNominations";
import DawnAnnouncement from "@/components/DawnAnnouncement";

// Generate or restore a stable client token for this room
function getOrCreateToken(code: string): string {
  const key = `botc-token:${code}`;
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(key, token);
  }
  return token;
}

export default function PlayerRoom() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const hasCheckedRoom = useRef(false);
  const [roomValid, setRoomValid] = useState<boolean | null>(null);

  const {
    playerName,
    setPlayerName,
    setPlayerId,
    syncRoomState,
    setRoomCode,
    revealedCharacter,
    revealedCharacterType,
    demonBluffs,
    wakePrompt,
    setRevealedCharacter,
    setDemonBluffs,
    setWakePrompt,
  } = useRoomStore();
  const players = useRoomStore(selectPlayers);
  const phase = useRoomStore(selectPhase);
  const roomState = useRoomStore((s) => s.roomState);

  // Stable client token
  const token = useMemo(
    () => (typeof window !== "undefined" ? getOrCreateToken(code) : ""),
    [code]
  );

  // Restore persisted name for this room
  const storageKey = `botc-player-name:${code}`;
  const savedName =
    typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;

  const [nameInput, setNameInput] = useState("");
  const [hasRejoined, setHasRejoined] = useState(false);
  const [error, setError] = useState("");
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const lastAnnouncedRound = useRef<number | null>(null);

  // Voting state — tracked locally for snappy UX
  const [isMyVoteTurn, setIsMyVoteTurn] = useState(false);
  const [voteSecondsLeft, setVoteSecondsLeft] = useState(10);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const voteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set the token as the player ID
  useEffect(() => {
    if (token) setPlayerId(token);
  }, [token, setPlayerId]);

  // Restore player name from storage on mount
  useEffect(() => {
    if (savedName) setPlayerName(savedName);
  }, [savedName, setPlayerName]);

  useEffect(() => { setRoomCode(code); }, [code, setRoomCode]);

  // Handle all server messages
  const handleMessage = (message: ServerMessage) => {
    if (message.type === "character:reveal") {
      setRevealedCharacter(message.character, message.characterType);
    }
    if (message.type === "demon:bluffs") {
      setDemonBluffs(message.bluffs);
    }
    if (message.type === "player:wake") {
      setWakePrompt(message.prompt);
    }
    if (message.type === "player:sleep") {
      setWakePrompt(null);
    }
    if (message.type === "vote:turn") {
      if (message.playerId === token) {
        setIsMyVoteTurn(true);
        setVoteSecondsLeft(message.timeRemaining);
        // Start countdown
        if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);
        voteIntervalRef.current = setInterval(() => {
          setVoteSecondsLeft((s) => {
            if (s <= 1) {
              if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      }
    }
    if (message.type === "vote:result") {
      // Clear my turn flag once my vote is recorded
      if (message.playerId === token) {
        setIsMyVoteTurn(false);
        if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);
      }
    }
    if (message.type === "vote:end") {
      setIsMyVoteTurn(false);
      if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);
    }
    if (message.type === "game:announcement") {
      setAnnouncement(message.text);
      setTimeout(() => setAnnouncement(null), 8000);
    }
    if (message.type === "day:execution") {
      setAnnouncement(`⚰️ ${message.playerName} was executed.`);
      setTimeout(() => setAnnouncement(null), 8000);
    }
  };

  const { send, isConnected } = usePartySocket({
    roomCode: code,
    onMessage: handleMessage,
    onStateSync: (state: RoomState) => {
      if (!hasCheckedRoom.current) {
        hasCheckedRoom.current = true;
        if (!state.hostId) { setRoomValid(false); return; }
        setRoomValid(true);
      }
      syncRoomState(state);
    },
    onError: (msg) => {
      setError(msg);
      if (msg === "Name already taken") {
        sessionStorage.removeItem(storageKey);
        setHasRejoined(false);
        setPlayerName(null);
      }
    },
  });

  // Auto-rejoin on refresh
  useEffect(() => {
    if (isConnected && savedName && token && !hasRejoined) {
      setHasRejoined(true);
      send({ type: "player:join", name: savedName, token });
    }
  }, [isConnected, savedName, token, hasRejoined, send]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = nameInput.trim();
    if (trimmedName.length < 1) { setError("Please enter a name"); return; }
    if (trimmedName.length > 20) { setError("Name must be 20 characters or less"); return; }
    setPlayerName(trimmedName);
    send({ type: "player:join", name: trimmedName, token });
    setError("");
  };

  // Reset announcement dismissed flag whenever night starts
  useEffect(() => {
    if (phase === "night") setAnnouncementDismissed(false);
  }, [phase]);

  // Derive join status from server-synced player list
  const hasJoined = players.some((p) => p.id === token);

  // Persist name to sessionStorage once confirmed
  useEffect(() => {
    if (hasJoined && playerName) sessionStorage.setItem(storageKey, playerName);
  }, [hasJoined, playerName, storageKey]);

  // ─── Room not found ───
  if (roomValid === false) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-4">Room Not Found</h1>
        <p className="text-gray-400 mb-8">
          No room exists with code <span className="font-mono font-bold">{code}</span>
        </p>
        <button
          onClick={() => router.push("/join")}
          className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
        >
          Back to Join
        </button>
      </main>
    );
  }

  // ─── Connecting ───
  if (roomValid === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-xl text-gray-400">Connecting to room...</p>
      </main>
    );
  }

  // ─── Name entry ───
  if (!hasJoined) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">Joining Room</p>
          <h1 className="text-4xl font-mono font-bold tracking-widest">{code}</h1>
        </div>
        <form onSubmit={handleJoin} className="w-full max-w-xs">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => { setNameInput(e.target.value); setError(""); }}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full text-center text-2xl py-4 px-6 bg-gray-800 border border-gray-600 rounded-lg mb-4"
            autoFocus
          />
          {error && <p className="text-red-500 text-center mb-4">{error}</p>}
          <button
            type="submit"
            disabled={!isConnected || nameInput.trim().length === 0}
            className="w-full bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
          >
            {isConnected ? "Join Game" : "Connecting..."}
          </button>
        </form>
      </main>
    );
  }

  // ─── Waiting for game to start ───
  if (phase === "waiting") {
  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="text-center mb-8">
        <p className="text-gray-400 mb-2">Room {code}</p>
        <h1 className="text-3xl font-bold">Welcome, {playerName}!</h1>
      </div>
      <div className="w-full max-w-md">
        <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Players ({players.length})</h2>
          <ul className="space-y-2">
            {players.map((player) => (
              <li
                key={player.id}
                className={`px-4 py-2 rounded flex items-center ${
                    player.id === token ? "bg-red-900/50 border border-red-700" : "bg-gray-700"
                }`}
              >
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3" />
                {player.name}
                  {player.id === token && (
                  <span className="ml-auto text-gray-400 text-sm">(you)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-center text-gray-400 mt-6">
          Waiting for host to start the game...
          </p>
          {error && <p className="text-red-500 text-center mt-4">{error}</p>}
        </div>
      </main>
    );
  }

  // ─── Setup phase: show character ───
  if (phase === "setup") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">Room {code}</p>
          <h1 className="text-2xl font-bold mb-6">{playerName}</h1>
        </div>
        {revealedCharacter && revealedCharacterType ? (
          <div className="w-full max-w-sm">
            <div className={`border rounded-xl p-8 text-center ${CHARACTER_TYPE_BG[revealedCharacterType]}`}>
              <p className="text-sm uppercase tracking-wider text-gray-400 mb-2">Your Character</p>
              <h2 className="text-4xl font-bold mb-3">{CHARACTER_DISPLAY_NAMES[revealedCharacter]}</h2>
              <p className={`text-lg font-semibold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}>
                {CHARACTER_TYPE_DISPLAY[revealedCharacterType]}
              </p>
            </div>
            <p className="text-center text-gray-400 mt-8 text-sm">
              The host is arranging seating...
            </p>
          </div>
        ) : (
          <p className="text-xl text-gray-400">Receiving your character...</p>
        )}
      </main>
    );
  }

  // Seating order (for circular layouts)
  const seatingOrder = roomState?.seatingOrder ?? players.map((p) => p.id);
  const myPlayer = players.find((p) => p.id === token);
  const round = roomState?.roundNumber ?? 1;

  // ─── Night phase ───
  if (phase === "night") {
    if (wakePrompt) {
      // Choose prompt → circular selection
      if (wakePrompt.promptType === "choose") {
        return (
          <NightChooseScreen
            wakePrompt={wakePrompt}
            revealedCharacter={revealedCharacter}
            revealedCharacterType={revealedCharacterType}
            players={players}
            seatingOrder={seatingOrder}
            myId={token}
            playerName={myPlayer?.name ?? playerName ?? undefined}
            allowSkip={revealedCharacter === "imp"}
            onSubmit={(targetIds) => {
              const action: NightAction = { action: "choose", targetIds };
              send({ type: "player:nightAction", action });
            }}
            onSkip={() => {
              send({ type: "player:nightAction", action: { action: "none" } });
            }}
          />
        );
      }

      // Grimoire prompt (Spy) → circular grimoire
      if (wakePrompt.promptType === "grimoire" && wakePrompt.grimoire) {
        return (
          <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-950">
            <div className="w-full max-w-lg text-center">
              <h1 className="text-3xl font-bold mb-2 text-yellow-400 animate-pulse">Wake Up!</h1>
              {revealedCharacter && revealedCharacterType && (
                <div className={`border rounded-xl p-3 mb-4 inline-block ${CHARACTER_TYPE_BG[revealedCharacterType]}`}>
                  {(myPlayer?.name ?? playerName) && (
                    <p className="text-sm font-semibold text-white mb-0.5">{myPlayer?.name ?? playerName}</p>
                  )}
                  <p className="text-xs text-gray-400">You are the</p>
                  <p className={`text-xl font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}>
                    {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
                  </p>
                </div>
              )}
              <p className="text-gray-400 text-sm mb-4">{wakePrompt.instruction}</p>
              <CircularGrimoire grimoire={wakePrompt.grimoire} />
              <button
                onClick={() => send({ type: "player:acknowledge" })}
                className="mt-4 w-full max-w-xs mx-auto bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
              >
                Got it — Go back to sleep
              </button>
            </div>
          </main>
        );
      }

      // Info prompt — show text + "Got it" button
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
          <div className="w-full max-w-sm text-center">
            <h1 className="text-4xl font-bold mb-6 text-yellow-400 animate-pulse">Wake Up!</h1>
            {revealedCharacter && revealedCharacterType && (
              <div className={`border rounded-xl p-4 mb-6 text-center ${CHARACTER_TYPE_BG[revealedCharacterType]}`}>
                {(myPlayer?.name ?? playerName) && (
                  <p className="text-base font-semibold text-white mb-1">{myPlayer?.name ?? playerName}</p>
                )}
                <p className="text-sm text-gray-400">You are the</p>
                <p className={`text-2xl font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}>
                  {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
                </p>
              </div>
            )}
            {/* Structured minion info */}
            {wakePrompt.minionInfo ? (
              <div className="mb-6 space-y-3">
                <div className="bg-red-950/60 border border-red-700 rounded-xl p-5 text-center">
                  <p className="text-xs uppercase tracking-widest text-red-400 mb-1">The Demon is</p>
                  <p className="text-3xl font-extrabold text-red-300">{wakePrompt.minionInfo.demonName}</p>
                </div>
                {wakePrompt.minionInfo.otherMinionNames.length > 0 && (
                  <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 text-center">
                    <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                      Fellow minion{wakePrompt.minionInfo.otherMinionNames.length > 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {wakePrompt.minionInfo.otherMinionNames.map((name) => (
                        <span key={name} className="bg-gray-700 border border-gray-500 px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-200">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 mb-6">
                <p className="text-lg leading-relaxed whitespace-pre-line">{wakePrompt.instruction}</p>
              </div>
            )}
            {revealedCharacterType === "demon" && demonBluffs && demonBluffs.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
                <p className="text-sm uppercase tracking-wider text-gray-400 mb-3">
                  These characters are not in play
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {demonBluffs.map((bluff) => (
                    <span key={bluff} className="bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                      {CHARACTER_DISPLAY_NAMES[bluff]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => send({ type: "player:acknowledge" })}
              className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
            >
              Got it — Go back to sleep
            </button>
          </div>
        </main>
      );
    }

    // Player is sleeping
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
        <h1 className="text-4xl font-bold mb-4">🌙 Night Time</h1>
        <p className="text-xl text-gray-400 mb-8">Close your eyes</p>
        <CharacterBadge
          revealedCharacter={revealedCharacter}
          revealedCharacterType={revealedCharacterType}
          playerName={myPlayer?.name ?? playerName ?? undefined}
        />
      </main>
    );
  }

  // ─── Day discussion phase ───
  if (phase === "day") {
    const deaths = roomState?.lastNightDeaths ?? [];
    const showAnnouncement = !announcementDismissed && lastAnnouncedRound.current !== round;

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        {showAnnouncement && (
          <DawnAnnouncement
            deaths={deaths}
            round={round}
            showButton={false}
            onDone={() => {
              lastAnnouncedRound.current = round;
              setAnnouncementDismissed(true);
            }}
          />
        )}

        {/* Floating announcement banner */}
        {announcement && (
          <AnnouncementBanner text={announcement} />
        )}

        <h1 className="text-4xl font-bold mb-2">☀️ Day {round}</h1>
        <p className="text-gray-400 mb-6 text-sm">Discussion time</p>

        <CharacterBadge
          revealedCharacter={revealedCharacter}
          revealedCharacterType={revealedCharacterType}
          playerName={myPlayer?.name ?? playerName ?? undefined}
        />

        {revealedCharacterType === "demon" && demonBluffs && demonBluffs.length > 0 && (
          <div className="mt-6 bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-sm w-full">
            <p className="text-sm uppercase tracking-wider text-gray-400 mb-3 text-center">
              These characters are not in play
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {demonBluffs.map((bluff) => (
                <span key={bluff} className="bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                  {CHARACTER_DISPLAY_NAMES[bluff]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Slayer ability button */}
        {myPlayer?.character === "slayer" && myPlayer.ability && myPlayer.alive && (
          <SlayerButton
            players={players}
            seatingOrder={seatingOrder}
            myId={token}
            onSlay={(targetId) => send({ type: "player:slay", targetId })}
          />
        )}
      </main>
    );
  }

  // ─── Nomination phase ───
  if (phase === "nomination") {
    const playersOnBlock = roomState?.playersOnBlock ?? [];
    const canINominate = myPlayer?.alive === true && myPlayer.ableToNominate === true;

    return (
      <main className="flex min-h-screen flex-col items-center p-6">
        {announcement && <AnnouncementBanner text={announcement} />}

        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold">🗳️ Nominations Open</h1>
          {canINominate ? (
            <p className="text-gray-400 text-sm mt-1">Tap a player to nominate them</p>
          ) : myPlayer?.alive ? (
            <p className="text-gray-500 text-sm mt-1">You have already nominated today</p>
          ) : (
            <p className="text-gray-500 text-sm mt-1">Dead players cannot nominate</p>
          )}
        </div>

        <CharacterBadge
          revealedCharacter={revealedCharacter}
          revealedCharacterType={revealedCharacterType}
          playerName={myPlayer?.name ?? playerName ?? undefined}
          compact
        />

        <div className="mt-4">
          <CircularNominations
            players={players}
            seatingOrder={seatingOrder}
            myId={token}
            onBlock={playersOnBlock}
            canINominate={canINominate}
            onNominate={(targetId) => send({ type: "player:nominate", targetId })}
          />
        </div>

        {playersOnBlock.length > 0 && (
          <div className="mt-4 bg-red-900/30 border border-red-700 rounded-xl px-5 py-2 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">On the block</p>
            <p className="text-lg font-bold text-red-300">
              {playersOnBlock
                .map((id) => players.find((p) => p.id === id)?.name ?? id)
                .join(" & ")}
            </p>
          </div>
        )}

        {/* Slayer during nominations */}
        {myPlayer?.character === "slayer" && myPlayer.ability && myPlayer.alive && (
          <SlayerButton
            players={players}
            seatingOrder={seatingOrder}
            myId={token}
            onSlay={(targetId) => send({ type: "player:slay", targetId })}
          />
        )}
      </main>
    );
  }

  // ─── Accusation / defence phase ───
  if (phase === "accusation") {
    const nom = roomState?.pendingNomination;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
        {announcement && <AnnouncementBanner text={announcement} />}

        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-4">⚖️ Accusation & Defence</h1>

          {nom ? (
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-5 mb-6">
              <p className="text-gray-400 text-sm mb-1">Nomination</p>
              <p className="text-lg">
                <span className="text-white font-semibold">{nom.nominatorName}</span>
                <span className="text-gray-500 mx-2">→</span>
                <span className="text-red-400 font-bold text-xl">{nom.nominatedName}</span>
              </p>
            </div>
          ) : null}

          <p className="text-gray-400 text-sm">
            {nom?.nominatedName === playerName
              ? "You have been nominated. Prepare your defence."
              : nom?.nominatorName === playerName
              ? "You made a nomination. The accused may speak."
              : "Listen to the accusation and defence."}
          </p>

          <p className="text-gray-600 text-xs mt-6">
            The host will start the vote when ready.
          </p>

          <CharacterBadge
            revealedCharacter={revealedCharacter}
            revealedCharacterType={revealedCharacterType}
            compact
          />

          {/* Slayer can still act during accusation */}
          {myPlayer?.character === "slayer" && myPlayer.ability && myPlayer.alive && (
            <SlayerButton
              players={players}
              seatingOrder={seatingOrder}
              myId={token}
              onSlay={(targetId) => send({ type: "player:slay", targetId })}
            />
          )}
        </div>
      </main>
    );
  }

  // ─── Voting phase ───
  if (phase === "voting") {
    const activeVote = roomState?.activeVote;
    if (!activeVote) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8">
          <p className="text-gray-400">Waiting for vote to start…</p>
        </main>
      );
    }

    if (isMyVoteTurn) {
      return (
        <PlayerVoteScreen
          vote={activeVote}
          secondsLeft={voteSecondsLeft}
          onVote={(v) => {
            send({ type: "player:vote", vote: v });
            setIsMyVoteTurn(false);
            if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);
          }}
        />
      );
    }

    return (
      <PlayerVoteWaitScreen vote={activeVote} players={players} myId={token} />
    );
  }

  // ─── Game over ───
  if (phase === "ended") {
    const winner = roomState?.winner;
    const winReason = roomState?.winReason ?? "";
    const isEvilWin = winner === "evil";
    const myTeam = revealedCharacterType === "demon" || revealedCharacterType === "minion" ? "evil" : "good";
    const iWon = myTeam === winner;
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center p-8 text-center"
        style={{
          background: isEvilWin
            ? "linear-gradient(to bottom, #0f0000 0%, #1a0000 100%)"
            : "linear-gradient(to bottom, #000a0f 0%, #00101a 100%)",
        }}
      >
        <div className="text-7xl mb-6">{isEvilWin ? "😈" : "😇"}</div>
        <h1 className={`text-5xl font-extrabold mb-2 ${isEvilWin ? "text-red-400" : "text-blue-300"}`}>
          {isEvilWin ? "Evil Wins!" : "Good Wins!"}
        </h1>
        <p className={`text-2xl font-semibold mb-4 ${iWon ? "text-yellow-400" : "text-gray-500"}`}>
          {iWon ? "🎉 You won!" : "You lost."}
        </p>
        {winReason && (
          <p className="text-gray-400 text-base max-w-sm">{winReason}</p>
        )}
        {revealedCharacter && revealedCharacterType && (
          <div className={`mt-8 border rounded-xl px-6 py-3 text-center ${CHARACTER_TYPE_BG[revealedCharacterType]}`}>
            <p className="text-sm text-gray-500">You were the</p>
            <p className={`font-bold text-xl ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}>
              {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
            </p>
          </div>
        )}
      </main>
    );
  }

  // ─── Fallback ───
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <p className="text-xl text-gray-400">Phase: {phase}</p>
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Night choose prompt component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { WakePrompt, Player, Character, CharacterType } from "@ai-botc/game-logic";

function NightChooseScreen({
  wakePrompt,
  revealedCharacter,
  revealedCharacterType,
  players,
  seatingOrder,
  myId,
  playerName,
  allowSkip,
  onSubmit,
  onSkip,
}: {
  wakePrompt: WakePrompt;
  revealedCharacter: Character | null;
  revealedCharacterType: CharacterType | null;
  players: Player[];
  seatingOrder: string[];
  myId: string;
  playerName?: string;
  /** If true, show a "Skip — no kill" button (used for Imp). */
  allowSkip?: boolean;
  onSubmit: (targetIds: string[]) => void;
  onSkip?: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const required = wakePrompt.selectCount ?? 1;
  const options = wakePrompt.options ?? [];

  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= required) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-950">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-4 text-yellow-400 animate-pulse">Wake Up!</h1>
        {revealedCharacter && revealedCharacterType && (
          <div className={`border rounded-xl p-3 mb-4 inline-block ${CHARACTER_TYPE_BG[revealedCharacterType]}`}>
            {playerName && (
              <p className="text-sm font-semibold text-white mb-0.5">{playerName}</p>
            )}
            <p className="text-xs text-gray-400">You are the</p>
            <p className={`text-xl font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}>
              {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
            </p>
          </div>
        )}
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 mb-4">
          <p className="text-lg mb-1">{wakePrompt.instruction}</p>
          <p className="text-sm text-gray-400">
            Select {required} player{required > 1 ? "s" : ""} ({selectedIds.length}/{required})
          </p>
        </div>
        <div className="mb-4">
          <CircularPlayerSelect
            players={players}
            seatingOrder={seatingOrder}
            options={options}
            selectedIds={selectedIds}
            onToggle={togglePlayer}
            myId={myId}
          />
        </div>
        <button
          onClick={() => { if (selectedIds.length === required) { onSubmit(selectedIds); setSelectedIds([]); } }}
          disabled={selectedIds.length !== required}
          className="w-full max-w-xs mx-auto bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
        >
          Confirm
        </button>
        {allowSkip && onSkip && (
          <button
            onClick={onSkip}
            className="mt-3 w-full max-w-xs mx-auto block text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
          >
            Skip — no kill tonight
          </button>
        )}
      </div>
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Player vote screen — it's my turn!
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { ActiveVote } from "@ai-botc/game-logic";

function PlayerVoteScreen({
  vote,
  secondsLeft,
  onVote,
}: {
  vote: ActiveVote;
  secondsLeft: number;
  onVote: (v: boolean) => void;
}) {
  const urgent = secondsLeft <= 3;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-1">⚖️ Your Vote</h1>
        <p className="text-gray-400 text-sm mb-6">
          <span className="text-white font-semibold">{vote.nominatorName}</span>
          <span className="text-gray-500 mx-1">nominated</span>
          <span className="text-red-400 font-semibold">{vote.nominatedName}</span>
        </p>

        {/* Timer ring */}
        <div className={`text-6xl font-mono font-bold mb-6 tabular-nums ${urgent ? "text-red-400 animate-pulse" : "text-yellow-300"}`}>
          {secondsLeft}
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => onVote(true)}
            className="flex-1 bg-green-700 hover:bg-green-600 active:scale-95 text-white font-bold py-6 text-2xl rounded-xl transition-all"
          >
            ✓ Yes
          </button>
          <button
            onClick={() => onVote(false)}
            className="flex-1 bg-gray-700 hover:bg-gray-600 active:scale-95 text-white font-bold py-6 text-2xl rounded-xl transition-all"
          >
            ✗ No
          </button>
        </div>

        <p className="text-gray-600 text-xs mt-4">
          No answer defaults to No after {secondsLeft}s
        </p>
      </div>
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Player vote wait screen — watching others vote
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PlayerVoteWaitScreen({
  vote,
  players,
  myId,
}: {
  vote: ActiveVote;
  players: Player[];
  myId: string;
}) {
  const currentVoterId = vote.voterOrder[vote.currentVoterIndex] ?? null;
  const currentVoterName =
    players.find((p) => p.id === currentVoterId)?.name ?? "…";
  const myIndex = vote.voterOrder.indexOf(myId);
  const myResult = vote.results[myId];
  const votesLeft = vote.voterOrder.length - vote.currentVoterIndex;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-1">⚖️ Vote in Progress</h1>
        <p className="text-gray-400 text-sm mb-6">
          <span className="text-white font-semibold">{vote.nominatorName}</span>
          <span className="text-gray-500 mx-1">nominated</span>
          <span className="text-red-400 font-semibold">{vote.nominatedName}</span>
        </p>

        {/* Current voter */}
        <div className="bg-gray-800 border border-yellow-700 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Now voting</p>
          <p className="text-2xl font-bold text-yellow-300">{currentVoterName}</p>
          <p className="text-gray-500 text-xs mt-1">{votesLeft} voter{votesLeft !== 1 ? "s" : ""} remaining</p>
        </div>

        {/* My upcoming vote status */}
        {myIndex >= 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 mb-4">
            {myResult !== undefined ? (
              <p className={`font-semibold ${myResult ? "text-green-400" : "text-red-400"}`}>
                You voted: {myResult ? "✓ Yes" : "✗ No"}
              </p>
            ) : myIndex <= vote.currentVoterIndex ? (
              <p className="text-yellow-400 text-sm">Your turn is coming up…</p>
            ) : (
              <p className="text-gray-500 text-sm">
                You are #{myIndex - vote.currentVoterIndex + 1} in the queue
              </p>
            )}
          </div>
        )}

        {/* Yes/No tally */}
        <div className="flex gap-4 justify-center text-sm">
          <span className="text-green-400 font-semibold">
            ✓ {vote.yesVoterIds.length} Yes
          </span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-400">
            {Object.values(vote.results).filter((v) => !v).length} No
          </span>
        </div>
      </div>
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Slayer ability button (day + nomination)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SlayerButton({
  players,
  seatingOrder,
  myId,
  onSlay,
}: {
  players: Player[];
  seatingOrder: string[];
  myId: string;
  onSlay: (targetId: string) => void;
}) {
  const [showSelect, setShowSelect] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const livingOthers = players.filter((p) => p.alive && p.id !== myId).map((p) => p.id);

  if (!showSelect) {
    return (
      <button
        onClick={() => setShowSelect(true)}
        className="mt-6 bg-orange-700 hover:bg-orange-600 active:scale-95 text-white font-bold py-3 px-8 rounded-xl transition-all border border-orange-500"
      >
        🗡️ Use Slayer Ability
      </button>
    );
  }

  return (
    <div className="mt-6 w-full max-w-sm text-center">
      <p className="text-sm text-gray-400 mb-2">Select someone to slay</p>
      <CircularPlayerSelect
        players={players}
        seatingOrder={seatingOrder}
        options={livingOthers}
        selectedIds={selectedTarget ? [selectedTarget] : []}
        onToggle={(id) => setSelectedTarget(id)}
        myId={myId}
      />
      <div className="flex gap-3 mt-3 justify-center">
        <button
          onClick={() => setShowSelect(false)}
          className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-5 rounded-lg text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => { if (selectedTarget) { onSlay(selectedTarget); setShowSelect(false); } }}
          disabled={!selectedTarget}
          className="bg-orange-700 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors"
        >
          Confirm Slay
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Small shared widgets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CharacterBadge({
  revealedCharacter,
  revealedCharacterType,
  playerName,
  compact = false,
}: {
  revealedCharacter: Character | null;
  revealedCharacterType: CharacterType | null;
  playerName?: string;
  compact?: boolean;
}) {
  if (!revealedCharacter || !revealedCharacterType) return null;

  if (compact) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 inline-flex gap-3 items-center">
        {playerName && (
          <>
            <span className="text-white font-semibold text-sm">{playerName}</span>
            <span className="text-gray-600">·</span>
          </>
        )}
        <span className="text-sm text-gray-500">You are the</span>
        <span className={`font-bold text-base ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}>
          {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-6 py-3 text-center">
      {playerName && (
        <p className="text-lg font-semibold text-white mb-1">{playerName}</p>
      )}
      <p className="text-sm text-gray-500">You are the</p>
      <p className={`font-bold ${CHARACTER_TYPE_COLORS[revealedCharacterType]}`}>
        {CHARACTER_DISPLAY_NAMES[revealedCharacter]}
      </p>
    </div>
  );
}

function AnnouncementBanner({ text }: { text: string }) {
  return (
    <div className="fixed top-4 left-4 right-4 z-50 bg-gray-900 border border-gray-600 rounded-xl px-5 py-4 shadow-lg text-center animate-in fade-in slide-in-from-top-2 duration-300">
      <p className="text-white font-semibold text-sm">{text}</p>
    </div>
  );
}
