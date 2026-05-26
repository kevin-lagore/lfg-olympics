"use client";

import { useMemo, useState } from "react";
import type { Activity, Game, Player } from "@/lib/types";
import {
  activityWithMostGames,
  computeActivityStats,
} from "@/lib/stats";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ActivityStats({
  players,
  activities,
  games,
  loading,
}: {
  players: Player[];
  activities: Activity[];
  games: Game[];
  loading: boolean;
}) {
  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [players]);

  // Per-activity game counts, for ordering the dropdown and picking a default.
  const countByActivity = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of games) {
      if (g.excluded) continue;
      m.set(g.activity_id, (m.get(g.activity_id) ?? 0) + 1);
    }
    return m;
  }, [games]);

  // Activities sorted by game count desc, then name, so the busiest leads.
  const orderedActivities = useMemo(() => {
    return [...activities].sort(
      (a, b) =>
        (countByActivity.get(b.id) ?? 0) - (countByActivity.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [activities, countByActivity]);

  const defaultActivityId = useMemo(
    () => activityWithMostGames(games) ?? orderedActivities[0]?.id ?? "",
    [games, orderedActivities],
  );

  // Explicit user choice (null until the user picks). We derive the effective
  // selection so the default can populate without a setState-in-effect.
  const [picked, setPicked] = useState<string | null>(null);

  // Effective selection: the user's pick if it still refers to a real activity,
  // otherwise fall back to the busiest activity.
  const selected =
    picked && activities.some((a) => a.id === picked)
      ? picked
      : defaultActivityId;

  const stats = useMemo(
    () => computeActivityStats(games, selected),
    [games, selected],
  );

  const selectedName = selected ? nameOf : null;
  const selectedActivityName =
    activities.find((a) => a.id === selected)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Activity Stats</h1>
        <Select
          value={selected || undefined}
          onValueChange={setPicked}
          disabled={loading || activities.length === 0}
        >
          <SelectTrigger className="h-12 w-full text-base">
            <SelectValue placeholder="Pick an activity" />
          </SelectTrigger>
          <SelectContent>
            {orderedActivities.map((a) => {
              const n = countByActivity.get(a.id) ?? 0;
              return (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({n} game{n === 1 ? "" : "s"})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </header>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No activities yet. Add one on the Record tab.
        </p>
      ) : !selected ? (
        <p className="py-12 text-center text-muted-foreground">
          Pick an activity to see its stats.
        </p>
      ) : stats.totalGames === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No games recorded for {selectedActivityName} yet.
        </p>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-2">
            <SummaryTile label="Games" value={stats.totalGames} />
            <SummaryTile label="Singles" value={stats.singles} />
            <SummaryTile label="Doubles" value={stats.doubles} />
          </div>

          {/* Win/Loss per player */}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Win / Loss
            </h2>
            <ul className="flex flex-col gap-1.5">
              {stats.records.map((r) => {
                const total = r.games || 1;
                const pct = Math.round((r.wins / total) * 100);
                return (
                  <li
                    key={r.playerId}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {selectedName!(r.playerId)}
                    </span>
                    <span className="tabular-nums text-sm">
                      <span className="font-semibold text-green-600">
                        {r.wins}
                      </span>
                      <span className="text-muted-foreground"> – </span>
                      <span className="font-semibold text-red-600">
                        {r.losses}
                      </span>
                    </span>
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Head-to-head */}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Head to head
            </h2>
            {stats.headToHead.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No matchups yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {stats.headToHead.map((h) => (
                  <li
                    key={`${h.aId}|${h.bId}`}
                    className="rounded-xl border bg-card p-3 text-sm shadow-sm"
                  >
                    <span className="font-medium">{selectedName!(h.aId)}</span>{" "}
                    <span className="text-muted-foreground">
                      {h.aWins > h.bWins
                        ? "beat"
                        : h.aWins === h.bWins
                          ? "tied"
                          : "lost to"}
                    </span>{" "}
                    <span className="font-medium">{selectedName!(h.bId)}</span>{" "}
                    <span className="tabular-nums font-semibold">
                      {h.aWins}–{h.bWins}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-3 shadow-sm">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
