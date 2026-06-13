"use client";

import { useState } from "react";
import type { Activity, Adjustment, Game, Player } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActivityStats } from "@/components/ActivityStats";
import { OverallStats } from "@/components/OverallStats";

type StatsMode = "overall" | "activity";

/**
 * The Stats tab body: a segmented toggle (styled like the Ranks/Stats toggle in
 * RanksAndStats) switching between the cross-activity overall view and the
 * per-activity view. Both reuse the already-loaded client data — no fetching.
 */
export function StatsView({
  players,
  activities,
  games,
  adjustments,
  loading,
}: {
  players: Player[];
  activities: Activity[];
  games: Game[];
  adjustments: Adjustment[];
  loading: boolean;
}) {
  const [mode, setMode] = useState<StatsMode>("overall");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Overall or per-activity stats"
        className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
      >
        {(
          [
            { key: "overall", label: "🌍 Overall" },
            { key: "activity", label: "🎯 By activity" },
          ] as const
        ).map((opt) => {
          const isActive = mode === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMode(opt.key)}
              className={cn(
                "lfg-press rounded-full py-2 text-sm font-bold transition-colors",
                isActive
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {mode === "overall" ? (
        <OverallStats
          players={players}
          games={games}
          adjustments={adjustments}
          loading={loading}
        />
      ) : (
        <ActivityStats
          players={players}
          activities={activities}
          games={games}
          loading={loading}
        />
      )}
    </div>
  );
}
