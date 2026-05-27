"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Activity, Adjustment, Game, Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Leaderboard } from "@/components/Leaderboard";
import { ActivityStats } from "@/components/ActivityStats";
import { ShareButton } from "@/components/ShareButton";

type SubTab = "ranks" | "stats";

/** Taps on the title needed to reveal the hidden Admin tab, and the max gap
 * (ms) allowed between taps before the count resets. */
const ADMIN_TAP_COUNT = 5;
const ADMIN_TAP_WINDOW_MS = 1500;

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
   * Fired when the app title is tapped 5 times in quick succession — the secret
   * reveal for the hidden Admin tab. Reliable on touch (plain clicks/taps),
   * unlike a long-press which mobile browsers hijack for select/context menus.
   */
  onRevealAdmin: () => void;
}) {
  const [sub, setSub] = useState<SubTab>("ranks");
  const [refreshing, setRefreshing] = useState(false);

  // Tap the title 5x in a row (within ADMIN_TAP_WINDOW_MS between taps) to
  // reveal the hidden Admin tab.
  const tapState = useRef<{ count: number; last: number }>({ count: 0, last: 0 });
  const handleTitleTap = () => {
    const now = Date.now();
    const s = tapState.current;
    s.count = now - s.last > ADMIN_TAP_WINDOW_MS ? 1 : s.count + 1;
    s.last = now;
    if (s.count >= ADMIN_TAP_COUNT) {
      s.count = 0;
      onRevealAdmin();
    }
  };

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
          className="cursor-default select-none text-2xl font-extrabold tracking-tight"
          // Tap 5× in a row to reveal the secret Admin tab.
          onClick={handleTitleTap}
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
