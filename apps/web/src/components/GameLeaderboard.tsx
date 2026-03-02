"use client";

import type { MiniGameLeaderboard } from "@ai-botc/game-logic";

interface GameLeaderboardProps {
  leaderboard: MiniGameLeaderboard;
  myPlayerId?: string;
}

/**
 * Displays mini-game leaderboard at game end.
 * Shows all players ranked by total score with expandable per-night breakdown.
 */
export default function GameLeaderboard({ leaderboard, myPlayerId }: GameLeaderboardProps) {
  // Sort players by total score descending
  const sortedPlayers = Object.entries(leaderboard)
    .map(([playerId, stats]) => ({
      playerId,
      ...stats,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  if (sortedPlayers.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <h2 className="text-3xl font-bold text-center mb-6 flex items-center justify-center gap-2">
        <span>🏆</span>
        <span className="text-yellow-400">Mini-Game Champions</span>
        <span>🏆</span>
      </h2>

      <div className="space-y-2">
        {sortedPlayers.map((player, index) => {
          const isMe = player.playerId === myPlayerId;
          const medal =
            index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;

          return (
            <div
              key={player.playerId}
              className={`
                rounded-xl p-4 transition-all
                ${
                  isMe
                    ? "bg-blue-900/50 border-2 border-blue-500"
                    : "bg-gray-800/50 border border-gray-700"
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl w-8 text-center">
                    {medal || `${index + 1}.`}
                  </span>
                  <div>
                    <p className={`font-bold ${isMe ? "text-blue-300" : "text-gray-200"}`}>
                      {player.playerName}
                      {isMe && <span className="ml-2 text-sm text-blue-400">(You)</span>}
                    </p>
                    <p className="text-sm text-gray-400">
                      {player.gameScores.length} game{player.gameScores.length !== 1 ? "s" : ""}{" "}
                      played
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-yellow-400">{player.totalScore}</p>
                  <p className="text-xs text-gray-500">points</p>
                </div>
              </div>

              {/* Per-night breakdown */}
              {player.gameScores.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                    View breakdown
                  </summary>
                  <div className="mt-2 space-y-1">
                    {player.gameScores.map((score, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-sm bg-gray-900/50 rounded px-3 py-1"
                      >
                        <span className="text-gray-400">
                          Night {score.night} - {score.game}
                        </span>
                        <span className="text-gray-200">{score.score} pts</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
