"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Trophy } from "lucide-react";
import { computeRatings } from "@/lib/elo";
import type { Activity, Game, Player } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatedRating } from "@/components/AnimatedRating";
import { ShareButton } from "@/components/ShareButton";
import { EmptyState } from "@/components/EmptyState";

/** How long a row stays flashed green/red after its rating changes. */
const FLASH_MS = 900;

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
  onRefresh,
}: {
  players: Player[];
  activities: Activity[];
  games: Game[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [activeOnly, setActiveOnly] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const ratings = computeRatings(games, players);
    return players
      .filter((p) => (activeOnly ? p.active : true))
      .map((p) => {
        const info = ratings.get(p.id);
        return {
          player: p,
          rating: info?.rating ?? 1500,
          gamesPlayed: info?.gamesPlayed ?? 0,
          lastChange: info?.lastChange ?? null,
        };
      })
      .sort((a, b) => b.rating - a.rating);
  }, [players, games, activeOnly]);

  const { min, max } = useMemo(() => {
    if (rows.length === 0) return { min: 1500, max: 1500 };
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <div className="flex items-center gap-1">
          <ShareButton />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </header>

      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 bg-background/95 py-2 backdrop-blur">
        <Label htmlFor="active-only" className="text-sm text-muted-foreground">
          Active only
        </Label>
        <Switch id="active-only" checked={activeOnly} onCheckedChange={setActiveOnly} />
      </div>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-8" />}
          title={
            activeOnly && players.length > 0
              ? "No active players"
              : "No players yet"
          }
          hint={
            activeOnly && players.length > 0
              ? "Turn off “Active only” to see everyone, or add players on the Record tab."
              : "Add some on the Record tab (or visit /seed) to get the rankings going."
          }
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const pct =
              max === min ? 100 : ((row.rating - min) / (max - min)) * 100;
            const change = row.lastChange;
            return (
              <li
                key={row.player.id}
                className={cn(
                  "rounded-xl border bg-card p-3 shadow-sm transition-colors duration-500",
                  flash[row.player.id] === "up" &&
                    "border-green-400 bg-green-50",
                  flash[row.player.id] === "down" && "border-red-400 bg-red-50",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-lg font-bold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">
                        {row.player.name}
                      </span>
                      <AnimatedRating
                        value={row.rating}
                        className="text-2xl font-bold tabular-nums"
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {row.gamesPlayed} game{row.gamesPlayed === 1 ? "" : "s"}
                      </span>
                      {change !== null && Math.round(change) !== 0 ? (
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            change > 0 ? "text-green-600" : "text-red-600",
                          )}
                        >
                          {change > 0 ? "+" : "−"}
                          {Math.abs(Math.round(change))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
