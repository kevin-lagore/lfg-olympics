"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { computeRatings, STARTING_RATING } from "@/lib/elo";
import type { Activity, Game, Player } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatedRating } from "@/components/AnimatedRating";
import { EmptyState } from "@/components/EmptyState";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { RatingViz } from "@/components/RatingViz";

/** How long a row stays flashed green/red after its rating changes. */
const FLASH_MS = 900;

/** Medal emoji for the top three; null otherwise. */
const MEDALS = ["🥇", "🥈", "🥉"] as const;

type Row = {
  player: Player;
  rating: number;
  gamesPlayed: number;
  lastChange: number | null;
};

export function Leaderboard({
  players,
  games,
  loading,
}: {
  players: Player[];
  activities: Activity[];
  games: Game[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const rows = useMemo<Row[]>(() => {
    const ratings = computeRatings(games, players);
    return players
      .filter((p) => p.active)
      .map((p) => {
        const info = ratings.get(p.id);
        return {
          player: p,
          rating: info?.rating ?? STARTING_RATING,
          gamesPlayed: info?.gamesPlayed ?? 0,
          lastChange: info?.lastChange ?? null,
        };
      })
      .sort((a, b) => b.rating - a.rating);
  }, [players, games]);

  const { min, max } = useMemo(() => {
    if (rows.length === 0) return { min: STARTING_RATING, max: STARTING_RATING };
    const values = rows.map((r) => r.rating);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [rows]);

  // Row flash on rating change: compare each player's rating to what it was on
  // the previous render. A change (e.g. after a realtime update) flashes the row
  // green (gain) or red (loss) for FLASH_MS, then clears.
  const prevRatings = useRef<Map<string, number>>(new Map());
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    const prev = prevRatings.current;
    const next = new Map<string, number>();
    const changed: Record<string, "up" | "down"> = {};
    for (const row of rows) {
      const before = prev.get(row.player.id);
      next.set(row.player.id, row.rating);
      if (before !== undefined && Math.round(before) !== Math.round(row.rating)) {
        changed[row.player.id] = row.rating > before ? "up" : "down";
      }
    }
    prevRatings.current = next;

    // First render (empty prev map) seeds baselines without flashing.
    if (prev.size === 0 || Object.keys(changed).length === 0) return;

    setFlash((f) => ({ ...f, ...changed }));
    const t = setTimeout(() => {
      setFlash((f) => {
        const rest = { ...f };
        for (const id of Object.keys(changed)) delete rest[id];
        return rest;
      });
    }, FLASH_MS);
    return () => clearTimeout(t);
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-8" />}
          title="No players yet"
          hint="Add some with the Record button (or visit /seed) to get the rankings going."
        />
      ) : (
        <>
          {/* Fun visual: a playful column chart of the rating pool. */}
          <RatingViz rows={rows.map((r) => ({ player: r.player, rating: r.rating }))} />

          <ol className="flex flex-col gap-2.5">
            {rows.map((row, i) => {
              const pct =
                max === min ? 100 : ((row.rating - min) / (max - min)) * 100;
              const change = row.lastChange;
              const medal = i < 3 ? MEDALS[i] : null;
              const isTop = i === 0;
              return (
                <li
                  key={row.player.id}
                  className={cn(
                    "lfg-pop-in lfg-press rounded-3xl border-2 bg-card p-3.5 shadow-sm transition-colors duration-500",
                    isTop
                      ? "border-amber-300 bg-amber-50/60"
                      : "border-transparent ring-1 ring-border",
                    flash[row.player.id] === "up" &&
                      "!border-green-400 !bg-green-50",
                    flash[row.player.id] === "down" &&
                      "!border-red-400 !bg-red-50",
                  )}
                  style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex w-8 shrink-0 items-center justify-center text-2xl">
                      {medal ?? (
                        <span className="text-lg font-extrabold tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                      )}
                    </span>
                    <PlayerAvatar
                      name={row.player.name}
                      seed={row.player.id}
                      size={isTop ? "lg" : "md"}
                      className={isTop ? "lfg-wiggle" : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate font-bold",
                            isTop ? "text-lg" : "text-base",
                          )}
                        >
                          {row.player.name}
                        </span>
                        <AnimatedRating
                          value={row.rating}
                          className={cn(
                            "font-extrabold tabular-nums",
                            isTop ? "text-3xl text-primary" : "text-2xl",
                          )}
                        />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium">
                          {row.gamesPlayed} game
                          {row.gamesPlayed === 1 ? "" : "s"}
                        </span>
                        {change !== null && Math.round(change) !== 0 ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                              change > 0
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700",
                            )}
                          >
                            {change > 0 ? "▲ +" : "▼ −"}
                            {Math.abs(Math.round(change))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </div>
                      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            isTop
                              ? "bg-gradient-to-r from-amber-400 to-amber-500"
                              : "bg-gradient-to-r from-primary/70 to-primary",
                          )}
                          style={{ width: `${Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
