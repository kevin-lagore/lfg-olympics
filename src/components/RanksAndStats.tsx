"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Activity, Adjustment, Game, Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Leaderboard } from "@/components/Leaderboard";
import { ActivityStats } from "@/components/ActivityStats";
import { ShareButton } from "@/components/ShareButton";
import { useLongPress } from "@/lib/useLongPress";

type SubTab = "ranks" | "stats";

/**
 * Merged "Ranks & Stats" tab (CLAUDE.md §5): the leaderboard (View 1) and the
 * per-activity stats (View 4) share one scrollable tab, switched by a segmented
 * toggle at the top. Both child views reuse the already-loaded client data — no
 * duplicate fetching; the elo/stats logic is untouched.
 */
export function RanksAndStats({
  players,
  activities,
  games,
  adjustments,
  loading,
  onRefresh,
  onRevealAdmin,
}: {
  players: Player[];
  activities: Activity[];
  games: Game[];
  adjustments: Adjustment[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  /**
   * Fired by a long-press (~600ms) on the app title — the secret reveal for the
   * hidden Admin tab (touch + mouse). A normal tap does NOT fire it.
   */
  onRevealAdmin: () => void;
}) {
  const [sub, setSub] = useState<SubTab>("ranks");
  const [refreshing, setRefreshing] = useState(false);

  // Long-press the title to reveal the hidden Admin tab (CLAUDE.md admin spec).
  const longPress = useLongPress(onRevealAdmin, 600);

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
        <h1
          className="select-none text-2xl font-extrabold tracking-tight"
          // Long-press (~600ms) to reveal the secret Admin tab. touch-none stops
          // the browser hijacking the pointer for scroll/text-select mid-press.
          style={{ touchAction: "none" }}
          {...longPress}
        >
          <span aria-hidden="true">🏆</span> LFG Olympics
        </h1>
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

      {/* Segmented Ranks / Stats toggle */}
      <div
        role="tablist"
        aria-label="Ranks and stats"
        className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
      >
        {(
          [
            { key: "ranks", label: "🏅 Ranks" },
            { key: "stats", label: "📈 Stats" },
          ] as const
        ).map((opt) => {
          const isActive = sub === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSub(opt.key)}
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

      {sub === "ranks" ? (
        <Leaderboard
          players={players}
          activities={activities}
          games={games}
          adjustments={adjustments}
          loading={loading}
          onRefresh={onRefresh}
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
