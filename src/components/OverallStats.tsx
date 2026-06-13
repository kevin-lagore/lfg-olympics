"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { Adjustment, Game, Player } from "@/lib/types";
import { computeOverallStats } from "@/lib/stats";
import { EmptyState } from "@/components/EmptyState";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SummaryTile } from "@/components/SummaryTile";

/** Medal emoji for the top three; number otherwise (matches the leaderboard). */
const MEDALS = ["🥇", "🥈", "🥉"] as const;

/**
 * Overall (cross-activity) stats: tournament-wide summary tiles plus a single
 * list of every player ranked by their ONE global Elo rating (§4 — there is no
 * per-activity rating, so this rating IS that global rating). Reuses the same
 * already-loaded client data as the leaderboard; nothing is fetched here.
 */
export function OverallStats({
  players,
  games,
  adjustments,
  loading,
}: {
  players: Player[];
  games: Game[];
  adjustments: Adjustment[];
  loading: boolean;
}) {
  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [players]);

  const stats = useMemo(
    () => computeOverallStats(games, players, adjustments),
    [games, players, adjustments],
  );

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading…</p>;
  }

  if (stats.totalGames === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-8" />}
        title="No games yet"
        hint="Record a result with the Record button and overall stats will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Games" value={stats.totalGames} />
        <SummaryTile label="Players" value={stats.players} />
        <SummaryTile label="Activities" value={stats.activities} />
      </div>

      {/* Players ranked by global rating */}
      <ul className="flex flex-col gap-1.5">
        {stats.rows.map((r, i) => {
          const medal = i < 3 ? MEDALS[i] : null;
          return (
            <li
              key={r.playerId}
              className="lfg-pop-in flex items-center gap-3 rounded-2xl border-2 border-transparent bg-card p-3 shadow-sm ring-1 ring-border"
            >
              <span className="flex w-7 shrink-0 items-center justify-center text-xl">
                {medal ?? (
                  <span className="text-sm font-extrabold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                )}
              </span>
              <PlayerAvatar
                name={nameOf(r.playerId)}
                seed={r.playerId}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold">
                    {nameOf(r.playerId)}
                  </span>
                  <span className="shrink-0 text-lg font-extrabold tabular-nums text-primary">
                    {Math.round(r.rating)}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.games} game{r.games === 1 ? "" : "s"} · {r.wins}–{r.losses}{" "}
                  · {r.winPct}% · {r.activities} activit
                  {r.activities === 1 ? "y" : "ies"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
