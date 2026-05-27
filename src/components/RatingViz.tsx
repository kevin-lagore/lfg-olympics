"use client";

import type { Player } from "@/lib/types";
import { ratingBarHeights } from "@/lib/viz";
import { avatarColorIndex, chartLabels } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { ScoringInfo } from "@/components/ScoringInfo";

/**
 * A playful column-chart view of the current rating pool (CLAUDE.md §5 View 1):
 * colourful, rounded, bouncy bars — a party scoreboard, not a dry chart. Bars
 * grow in with a springy keyframe (snaps under prefers-reduced-motion via the
 * `.lfg-grow-bar` utility). Reuses the avatar colour buckets so a player's bar
 * matches their avatar elsewhere.
 */

// Gradient per avatar colour bucket (index range matches AVATAR_COLOR_COUNT).
const BAR_GRADIENTS = [
  "from-rose-300 to-rose-500",
  "from-amber-300 to-amber-500",
  "from-emerald-300 to-emerald-500",
  "from-sky-300 to-sky-500",
  "from-violet-300 to-violet-500",
  "from-fuchsia-300 to-fuchsia-500",
] as const;

export type VizRow = {
  player: Player;
  rating: number;
};

export function RatingViz({ rows }: { rows: VizRow[] }) {
  if (rows.length === 0) return null;
  const heights = ratingBarHeights(rows.map((r) => r.rating));
  const labels = chartLabels(rows.map((r) => r.player.name));

  return (
    <section className="rounded-3xl border-2 border-primary/15 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">
          📊
        </span>
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-primary">
          Score
        </h2>
        <ScoringInfo />
      </div>
      <div
        className="flex items-end justify-start gap-2 overflow-x-auto pb-1"
        role="img"
        aria-label="Bar chart of player ratings"
      >
        {rows.map((row, i) => {
          const grad = BAR_GRADIENTS[avatarColorIndex(row.player.id)];
          return (
            <div
              key={row.player.id}
              className="flex min-w-[2.75rem] flex-1 flex-col items-center gap-1"
            >
              <span className="text-xs font-bold tabular-nums text-foreground/70">
                {Math.round(row.rating)}
              </span>
              <div className="flex h-28 w-full items-end justify-center">
                <div
                  className={cn(
                    "lfg-grow-bar w-7 rounded-t-xl bg-gradient-to-t shadow-sm sm:w-8",
                    grad,
                  )}
                  style={{
                    height: `${heights[i].heightPct}%`,
                    animationDelay: `${Math.min(i * 60, 360)}ms`,
                  }}
                />
              </div>
              <span
                className={cn(
                  "inline-flex max-w-full items-center justify-center rounded-full px-1.5 py-0.5 text-[0.6rem] font-extrabold leading-none",
                  "truncate bg-muted text-foreground/70",
                )}
                title={row.player.name}
              >
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
