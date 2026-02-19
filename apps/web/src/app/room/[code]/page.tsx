"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { usePartySocket } from "@/hooks/usePartySocket";
import { useRoomStore, selectPlayers, selectPhase } from "@/stores/roomStore";
import CircularSeating from "@/components/CircularSeating";
import CircularSeatingView from "@/components/CircularSeatingView";
import DawnAnnouncement from "@/components/DawnAnnouncement";
import DuskAnnouncement from "@/components/DuskAnnouncement";

// Generate or restore a stable host token for this room
function getOrCreateHostToken(code: string): string {
  const key = `botc-host-token:${code}`;
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(key, token);
  }
  return token;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Countdown hook — returns "mm:ss" string, updates every 500ms
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useCountdown(endsAt: number | undefined): string {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);
  const m = Math.floor(remaining / 60).toString().padStart(2, "0");
  const s = (remaining % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function HostRoom() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const hasRegisteredHost = useRef(false);

  const { syncRoomState, setRoomCode, setIsHost, roomState } = useRoomStore();
  const players = useRoomStore(selectPlayers);
  const phase = useRoomStore(selectPhase);

  // Track whether the dawn announcement has been dismissed for this round
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const lastAnnouncedRound = useRef<number | null>(null);

  // Stable host token
  const token = useMemo(
    () => (typeof window !== "undefined" ? getOrCreateHostToken(code) : ""),
    [code]
  );

  useEffect(() => {
    setRoomCode(code);
    setIsHost(true);
  }, [code, setRoomCode, setIsHost]);

  const { send, isConnected } = usePartySocket({
    roomCode: code,
    onStateSync: syncRoomState,
  });

  // Register as host when connected
  useEffect(() => {
    if (isConnected && !hasRegisteredHost.current && token) {
      hasRegisteredHost.current = true;
      send({ type: "host:create", token });
    }
  }, [isConnected, token, send]);

  // Reset announcement dismissed flag whenever night starts (so next day shows fresh)
  useEffect(() => {
    if (phase === "night") {
      setAnnouncementDismissed(false);
    }
  }, [phase]);

  const handleStartGame = () => send({ type: "host:start" });
  const handleSetSeating = useCallback(
    (seatingOrder: string[]) => send({ type: "host:setSeating", seatingOrder }),
    [send]
  );
  const handleConfirmSeating = () => send({ type: "host:confirmSeating" });
  const handleStartNominations = () => send({ type: "host:startNominations" });
  const handleStartVote = () => send({ type: "host:startVote" });
  const handleGoToNight = () => send({ type: "host:goToNight" });
  const handleProceedToNight = () => send({ type: "host:proceedToNight" });
  const handleExtendTimer = (seconds: number) =>
    send({ type: "host:extendTimer", seconds });

  const canStart = players.length >= 5;
  const seatingOrder = roomState?.seatingOrder ?? [];
  const round = roomState?.roundNumber ?? 1;
  const deaths = roomState?.lastNightDeaths ?? [];
  const activeVote = roomState?.activeVote;
  const playersOnBlock = roomState?.playersOnBlock ?? [];
  const blockVoteCounts = roomState?.blockVoteCounts ?? {};

  // ─── Waiting phase ───
  if (phase === "waiting") {
    return (
      <main className="flex min-h-screen flex-col items-center p-8">
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">Room Code</p>
          <h1 className="text-5xl font-mono font-bold tracking-widest">{code}</h1>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Players ({players.length}/15)</h2>
            {players.length === 0 ? (
              <p className="text-gray-400">Waiting for players to join...</p>
            ) : (
              <ul className="space-y-2">
                {players.map((player) => (
                  <li key={player.id} className="bg-gray-700 px-4 py-2 rounded flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-3" />
                    {player.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className="w-full bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
          >
            {canStart ? "Start Game" : `Need ${5 - players.length} more players`}
          </button>

          {!isConnected && (
            <p className="text-yellow-500 text-center mt-4">Connecting...</p>
          )}
        </div>
      </main>
    );
  }

  // ─── Setup phase: arrange seating ───
  if (phase === "setup") {
    return (
      <main className="flex min-h-screen flex-col items-center p-8">
        <CircularSeating
          players={players}
          seatingOrder={seatingOrder}
          onReorder={handleSetSeating}
          onConfirm={handleConfirmSeating}
        />
      </main>
    );
  }

  // ─── Dusk / execution announcement phase ───
  if (phase === "dusk") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950">
        <DuskAnnouncement
          executedName={roomState?.lastExecutedName ?? ""}
          tiedNames={roomState?.lastExecutedTie}
          round={round}
          onDone={handleProceedToNight}
        />
      </main>
    );
  }

  // ─── Night phase ───
  if (phase === "night") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-950">
        <h1 className="text-4xl font-bold mb-2">🌙 Night Time</h1>
        <p className="text-gray-500 mb-6">Round {round}</p>
        <p className="text-xl text-gray-400">Please look only at your own phone</p>
      </main>
    );
  }

  // ─── Day discussion phase ───
  if (phase === "day") {
    const showAnnouncement = !announcementDismissed && lastAnnouncedRound.current !== round;
    return (
      <main className="flex min-h-screen flex-col items-center p-6 bg-gray-950 text-white">
        {showAnnouncement && (
          <DawnAnnouncement
            deaths={deaths}
            round={round}
            showButton
            onDone={() => {
              lastAnnouncedRound.current = round;
              setAnnouncementDismissed(true);
            }}
          />
        )}

        <HostDayView
          round={round}
          timerEndsAt={roomState?.dayTimerEndsAt}
          players={players}
          seatingOrder={seatingOrder}
          playersOnBlock={playersOnBlock}
          blockVoteCounts={blockVoteCounts}
          onStartNominations={handleStartNominations}
          onExtend={(m) => handleExtendTimer(m * 60)}
          onGoToNight={handleGoToNight}
        />
      </main>
    );
  }

  // ─── Nomination phase ───
  if (phase === "nomination") {
    return (
      <main className="flex min-h-screen flex-col items-center p-6 bg-gray-950 text-white">
        <HostNominationView
          round={round}
          timerEndsAt={roomState?.dayTimerEndsAt}
          players={players}
          seatingOrder={seatingOrder}
          playersOnBlock={playersOnBlock}
          blockVoteCounts={blockVoteCounts}
          onExtend={(m) => handleExtendTimer(m * 60)}
          onGoToNight={handleGoToNight}
        />
      </main>
    );
  }

  // ─── Accusation / defence phase ───
  if (phase === "accusation" && roomState?.pendingNomination) {
    return (
      <main className="flex min-h-screen flex-col items-center p-6 bg-gray-950 text-white">
        <HostAccusationView
          nomination={roomState.pendingNomination}
          timerEndsAt={roomState.accusationTimerEndsAt}
          players={players}
          seatingOrder={seatingOrder}
          playersOnBlock={playersOnBlock}
          blockVoteCounts={blockVoteCounts}
          onExtend={(m) => handleExtendTimer(m * 60)}
          onStartVote={handleStartVote}
        />
      </main>
    );
  }

  // ─── Voting phase ───
  if (phase === "voting" && activeVote) {
    return (
      <main className="flex min-h-screen flex-col items-center p-6 bg-gray-950 text-white">
        <HostVotingView
          vote={activeVote}
          players={players}
          seatingOrder={seatingOrder}
          playersOnBlock={playersOnBlock}
          blockVoteCounts={blockVoteCounts}
        />
      </main>
    );
  }

  // ─── Game over ───
  if (phase === "ended") {
    const winner = roomState?.winner;
    const winReason = roomState?.winReason ?? "";
    const isEvilWin = winner === "evil";
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center p-8 text-center"
        style={{
          background: isEvilWin
            ? "linear-gradient(to bottom, #0f0000 0%, #1a0000 100%)"
            : "linear-gradient(to bottom, #000a0f 0%, #00101a 100%)",
        }}
      >
        <div
          className="text-7xl mb-6"
          style={{ animation: "duskFadeIn 1.5s ease forwards" }}
        >
          {isEvilWin ? "😈" : "😇"}
        </div>
        <h1
          className={`text-5xl font-extrabold mb-4 ${isEvilWin ? "text-red-400" : "text-blue-300"}`}
          style={{ animation: "duskFadeIn 1.5s ease forwards" }}
        >
          {isEvilWin ? "Evil Wins!" : "Good Wins!"}
        </h1>
        {winReason && (
          <p className="text-gray-400 text-lg max-w-md mt-2">{winReason}</p>
        )}
        <div className="mt-10 text-gray-600 text-sm">Game Over</div>
      </main>
    );
  }

  // Fallback
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <p className="text-xl text-gray-400">Phase: {phase}</p>
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-views
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Player, ActiveVote } from "@ai-botc/game-logic";

interface DayViewProps {
  round: number;
  timerEndsAt: number | undefined;
  players: Player[];
  seatingOrder: string[];
  playersOnBlock: string[];
  blockVoteCounts: Record<string, number>;
  onStartNominations: () => void;
  onExtend: (minutes: number) => void;
  onGoToNight: () => void;
}

function HostDayView({
  round,
  timerEndsAt,
  players,
  seatingOrder,
  playersOnBlock,
  blockVoteCounts,
  onStartNominations,
  onExtend,
  onGoToNight,
}: DayViewProps) {
  const time = useCountdown(timerEndsAt);
  const blockNames = playersOnBlock
    .map((id) => players.find((p) => p.id === id)?.name ?? id)
    .join(" & ");

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-4">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold">☀️ Day {round}</h1>
        <p className="text-gray-400 mt-1 text-sm uppercase tracking-widest">
          Individual Conversation Time
        </p>
      </div>

      {/* Timer */}
      <TimerDisplay time={time} label="Discussion ends in" urgent={isUrgent(timerEndsAt)} />

      {/* Seating */}
      <CircularSeatingView
        players={players}
        seatingOrder={seatingOrder}
        highlightId={playersOnBlock[0]}
      />

      {/* Block status */}
      <BlockStatus
        playersOnBlock={playersOnBlock}
        blockNames={blockNames}
        blockVoteCounts={blockVoteCounts}
        players={players}
      />

      {/* Host controls */}
      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={() => onExtend(2)}
          className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-5 rounded-lg transition-colors"
        >
          +2 min
        </button>
        <button
          onClick={onStartNominations}
          className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
        >
          Start Nominations
        </button>
        <button
          onClick={onGoToNight}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-semibold py-2 px-5 rounded-lg transition-colors"
        >
          Go to Night
        </button>
      </div>
    </div>
  );
}

interface NominationViewProps {
  round: number;
  timerEndsAt: number | undefined;
  players: Player[];
  seatingOrder: string[];
  playersOnBlock: string[];
  blockVoteCounts: Record<string, number>;
  onExtend: (minutes: number) => void;
  onGoToNight: () => void;
}

function HostNominationView({
  round,
  timerEndsAt,
  players,
  seatingOrder,
  playersOnBlock,
  blockVoteCounts,
  onExtend,
  onGoToNight,
}: NominationViewProps) {
  const time = useCountdown(timerEndsAt);
  const blockNames = playersOnBlock
    .map((id) => players.find((p) => p.id === id)?.name ?? id)
    .join(" & ");

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🗳️ Day {round} — Nominations Open</h1>
        <p className="text-gray-400 mt-1 text-sm uppercase tracking-widest">
          Players may nominate from their phones
        </p>
      </div>

      <TimerDisplay time={time} label="Nominations close in" urgent={isUrgent(timerEndsAt)} />

      <CircularSeatingView
        players={players}
        seatingOrder={seatingOrder}
        highlightId={playersOnBlock[0]}
      />

      <BlockStatus
        playersOnBlock={playersOnBlock}
        blockNames={blockNames}
        blockVoteCounts={blockVoteCounts}
        players={players}
      />

      {/* Host controls */}
      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={() => onExtend(2)}
          className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-5 rounded-lg transition-colors"
        >
          +2 min
        </button>
        <button
          onClick={onGoToNight}
          className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
        >
          Go to Night
        </button>
      </div>
    </div>
  );
}

interface AccusationViewProps {
  nomination: {
    nominatorId: string;
    nominatedId: string;
    nominatorName: string;
    nominatedName: string;
  };
  timerEndsAt: number | undefined;
  players: Player[];
  seatingOrder: string[];
  playersOnBlock: string[];
  blockVoteCounts: Record<string, number>;
  onExtend: (minutes: number) => void;
  onStartVote: () => void;
}

function HostAccusationView({
  nomination,
  timerEndsAt,
  players,
  seatingOrder,
  playersOnBlock,
  blockVoteCounts,
  onExtend,
  onStartVote,
}: AccusationViewProps) {
  const time = useCountdown(timerEndsAt);
  const blockNames = playersOnBlock
    .map((id) => players.find((p) => p.id === id)?.name ?? id)
    .join(" & ");

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-4">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">⚖️ Accusation & Defence</h1>
        <div className="mt-2 flex items-center justify-center gap-2 text-lg">
          <span className="text-white font-semibold">{nomination.nominatorName}</span>
          <span className="text-gray-500 text-sm">nominated</span>
          <span className="text-red-400 font-bold text-xl">{nomination.nominatedName}</span>
        </div>
        <p className="text-gray-500 text-xs mt-1 uppercase tracking-widest">
          Allow accusation and defence before the vote
        </p>
      </div>

      {/* Timer */}
      <TimerDisplay
        time={time}
        label="Accusation time remaining"
        urgent={isUrgent(timerEndsAt)}
      />

      {/* Seating — highlight the nominated player */}
      <CircularSeatingView
        players={players}
        seatingOrder={seatingOrder}
        highlightId={nomination.nominatedId}
      />

      {/* Block status */}
      <BlockStatus
        playersOnBlock={playersOnBlock}
        blockNames={blockNames}
        blockVoteCounts={blockVoteCounts}
        players={players}
      />

      {/* Host controls */}
      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={() => onExtend(2)}
          className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-5 rounded-lg transition-colors"
        >
          +2 min
        </button>
        <button
          onClick={onStartVote}
          className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-8 rounded-lg transition-colors"
        >
          Start Vote
        </button>
      </div>
    </div>
  );
}

interface VotingViewProps {
  vote: ActiveVote;
  players: Player[];
  seatingOrder: string[];
  playersOnBlock: string[];
  blockVoteCounts: Record<string, number>;
}

function HostVotingView({
  vote,
  players,
  seatingOrder,
  playersOnBlock,
  blockVoteCounts,
}: VotingViewProps) {
  // Vote timer countdown
  const time = useCountdown(vote.voteTimerEndsAt);
  const currentVoterId = vote.voterOrder[vote.currentVoterIndex] ?? null;
  const currentVoterName =
    players.find((p) => p.id === currentVoterId)?.name ?? currentVoterId ?? "…";

  const yesCount = vote.yesVoterIds.length;
  const aliveCount = players.filter((p) => p.alive).length;
  const needed = Math.ceil(aliveCount / 2);

  const blockNames = playersOnBlock
    .map((id) => players.find((p) => p.id === id)?.name ?? id)
    .join(" & ");

  // Build a voter result table in vote order
  const voteRows = vote.voterOrder.map((id) => {
    const p = players.find((pl) => pl.id === id);
    const result = vote.results[id];
    return { id, name: p?.name ?? id, result };
  });

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-4">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">⚖️ Vote in Progress</h1>
        <p className="text-lg text-gray-300 mt-1">
          <span className="text-white font-semibold">{vote.nominatorName}</span>
          <span className="text-gray-500 mx-2">nominated</span>
          <span className="text-red-400 font-semibold">{vote.nominatedName}</span>
        </p>
      </div>

      {/* Current voter */}
      <div className="bg-gray-800 border border-gray-600 rounded-xl px-6 py-4 text-center w-full">
        <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">Now voting</p>
        <p className="text-2xl font-bold text-yellow-300">{currentVoterName}</p>
        <p className="text-gray-500 text-sm mt-1 font-mono">{time} remaining</p>
      </div>

      {/* Yes/No tally */}
      <div className="flex gap-6 text-center">
        <div className="bg-green-900/40 border border-green-700 rounded-lg px-6 py-3">
          <p className="text-3xl font-bold text-green-400">{yesCount}</p>
          <p className="text-xs text-green-600 uppercase tracking-wider mt-0.5">Yes</p>
        </div>
        <div className="flex flex-col items-center justify-center">
          <p className="text-gray-500 text-sm">Need {needed} to place on block</p>
        </div>
        <div className="bg-gray-800 border border-gray-600 rounded-lg px-6 py-3">
          <p className="text-3xl font-bold text-gray-400">
            {vote.voterOrder.length - yesCount - (vote.voterOrder.length - Object.keys(vote.results).length)}
          </p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">No</p>
        </div>
      </div>

      {/* Vote order list */}
      <div className="w-full bg-gray-900 rounded-xl p-3 max-h-48 overflow-y-auto">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Vote order</p>
        <div className="space-y-1">
          {voteRows.map((row, i) => {
            const isCurrent = i === vote.currentVoterIndex;
            const hasVoted = row.result !== undefined;
            return (
              <div
                key={row.id}
                className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${
                  isCurrent
                    ? "bg-yellow-900/40 border border-yellow-700"
                    : hasVoted
                    ? "bg-gray-800"
                    : "opacity-50"
                }`}
              >
                <span className={isCurrent ? "text-yellow-200 font-semibold" : "text-gray-300"}>
                  {row.name}
                </span>
                {hasVoted ? (
                  <span className={row.result ? "text-green-400" : "text-red-400"}>
                    {row.result ? "✓ Yes" : "✗ No"}
                  </span>
                ) : isCurrent ? (
                  <span className="text-yellow-400 animate-pulse text-xs">voting…</span>
                ) : (
                  <span className="text-gray-600 text-xs">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Seating highlight the nominated */}
      <CircularSeatingView
        players={players}
        seatingOrder={seatingOrder}
        highlightId={vote.nominatedId}
      />

      {/* Block status */}
      <BlockStatus
        playersOnBlock={playersOnBlock}
        blockNames={blockNames}
        blockVoteCounts={blockVoteCounts}
        players={players}
      />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Small shared widgets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TimerDisplay({
  time,
  label,
  urgent,
}: {
  time: string;
  label: string;
  urgent: boolean;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`text-5xl font-mono font-bold tabular-nums transition-colors ${
          urgent ? "text-red-400 animate-pulse" : "text-white"
        }`}
      >
        {time}
      </p>
    </div>
  );
}

function BlockStatus({
  playersOnBlock,
  blockNames,
  blockVoteCounts,
  players,
}: {
  playersOnBlock: string[];
  blockNames: string;
  blockVoteCounts: Record<string, number>;
  players: Player[];
}) {
  if (playersOnBlock.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-5 py-3 text-center">
        <p className="text-gray-500 text-sm">No one on the block</p>
      </div>
    );
  }

  const isTied = playersOnBlock.length > 1;

  return (
    <div
      className={`border rounded-xl px-6 py-3 text-center ${
        isTied
          ? "bg-orange-900/30 border-orange-700"
          : "bg-red-900/30 border-red-700"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">
        {isTied ? "Tied — no execution" : "On the block"}
      </p>
      <p className="text-xl font-bold text-red-300">{blockNames}</p>
      {!isTied && (
        <p className="text-xs text-gray-500 mt-0.5">
          {blockVoteCounts[playersOnBlock[0]] ?? 0} votes
        </p>
      )}
      {isTied && (
        <p className="text-xs text-orange-400 mt-1">
          {playersOnBlock
            .map(
              (id) =>
                `${players.find((p) => p.id === id)?.name ?? id}: ${blockVoteCounts[id] ?? 0}`
            )
            .join(" | ")}
        </p>
      )}
    </div>
  );
}

function isUrgent(endsAt: number | undefined): boolean {
  if (!endsAt) return false;
  return endsAt - Date.now() < 60_000;
}
