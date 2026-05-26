"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { computeRatings } from "@/lib/elo";
import type { Activity, Game, Player } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-5", refreshing && "animate-spin")} />
        </Button>
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
        <p className="py-12 text-center text-muted-foreground">
          No players yet. Add some on the Record tab (or visit /seed).
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const pct =
              max === min ? 100 : ((row.rating - min) / (max - min)) * 100;
            const change = row.lastChange;
            return (
              <li
                key={row.player.id}
                className="rounded-xl border bg-card p-3 shadow-sm"
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
                      <span className="text-2xl font-bold tabular-nums">
                        {Math.round(row.rating)}
                      </span>
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
