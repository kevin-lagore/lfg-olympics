"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EyeOff, Eye, ScrollText, CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { computeGameDeltas } from "@/lib/elo";
import type { Activity, Game, Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/** Compact relative timestamp, e.g. "just now", "5m ago", "3h ago", "2d ago". */
function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDelta(delta: number | undefined): string {
  if (delta === undefined) return "";
  const rounded = Math.round(delta);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}`;
}

export function History({
  players,
  activities,
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
  const [pages, setPages] = useState(1);
  // Tracks rows whose toggle is mid-flight so we can disable the button.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // "Now" reference for relative timestamps; ticks every 30s so labels age.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [players]);

  const activityName = useMemo(() => {
    const m = new Map(activities.map((a) => [a.id, a.name]));
    return (id: string) => m.get(id) ?? "Unknown activity";
  }, [activities]);

  // Per-game per-player deltas, consistent with the leaderboard replay.
  const deltas = useMemo(
    () => computeGameDeltas(games, players),
    [games, players],
  );

  // Reverse-chronological: newest first. Same key as the replay sort, reversed.
  const ordered = useMemo(() => {
    return [...games].sort((a, b) => {
      const pa = b.played_at.localeCompare(a.played_at);
      if (pa !== 0) return pa;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [games]);

  const visible = ordered.slice(0, pages * PAGE_SIZE);
  const hasMore = ordered.length > visible.length;

  async function toggleExcluded(game: Game) {
    setPending((p) => ({ ...p, [game.id]: true }));
    try {
      const next = !game.excluded;
      const { error } = await supabase
        .from("games")
        .update({ excluded: next })
        .eq("id", game.id);
      if (error) {
        toast.error(`Could not update: ${error.message}`);
        return;
      }
      toast.success(next ? "Game excluded" : "Game included");
      // Realtime will also fire, but refresh now for immediate feedback.
      await onRefresh();
    } finally {
      setPending((p) => {
        const rest = { ...p };
        delete rest[game.id];
        return rest;
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">
          <span aria-hidden="true">📜</span> History
        </h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {ordered.length} game{ordered.length === 1 ? "" : "s"}
        </span>
      </header>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-8" />}
          title="No games yet"
          hint="Tap the Record button and your games will show up here."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((game) => {
              const gameDeltas = deltas.get(game.id);
              const isPending = !!pending[game.id];
              const winners = game.winner_ids;
              const losers = game.loser_ids;

              return (
                <li
                  key={game.id}
                  className={cn(
                    "lfg-pop-in rounded-2xl border-2 border-transparent bg-card p-3 shadow-sm ring-1 ring-border",
                    game.excluded && "border-dashed border-border opacity-60 ring-0",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-sm font-semibold",
                            game.excluded && "italic",
                          )}
                        >
                          {activityName(game.activity_id)}
                        </span>
                        {game.is_doubles && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Doubles
                          </span>
                        )}
                        {game.excluded && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                            Excluded
                          </span>
                        )}
                      </div>

                      <div
                        className={cn(
                          "mt-2 flex flex-col gap-1.5 text-sm",
                          game.excluded && "italic",
                        )}
                      >
                        {/* Winners */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-green-600">
                            Won
                          </span>
                          {winners.map((id) => (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1"
                            >
                              <span className="font-medium">{nameOf(id)}</span>
                              <span
                                className={cn(
                                  "text-xs font-semibold tabular-nums",
                                  game.excluded
                                    ? "text-muted-foreground"
                                    : "text-green-600",
                                )}
                              >
                                {formatDelta(gameDeltas?.get(id))}
                              </span>
                            </span>
                          ))}
                        </div>
                        {/* Losers */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
                            Lost
                          </span>
                          {losers.map((id) => (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1"
                            >
                              <span className="font-medium">{nameOf(id)}</span>
                              <span
                                className={cn(
                                  "text-xs font-semibold tabular-nums",
                                  game.excluded
                                    ? "text-muted-foreground"
                                    : "text-red-600",
                                )}
                              >
                                {formatDelta(gameDeltas?.get(id))}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <p className="mt-2 text-xs text-muted-foreground">
                        {relativeTime(game.played_at, now)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-1.5">
                      <EditPlayedAtModal
                        game={game}
                        onRefresh={onRefresh}
                      />
                      <Button
                        variant={game.excluded ? "outline" : "destructive"}
                        size="sm"
                        disabled={isPending}
                        onClick={() => toggleExcluded(game)}
                        aria-label={
                          game.excluded ? "Include game" : "Exclude game"
                        }
                      >
                        {game.excluded ? (
                          <>
                            <Eye className="size-3.5" /> Include
                          </>
                        ) : (
                          <>
                            <EyeOff className="size-3.5" /> Exclude
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <Button
              variant="outline"
              className="mt-1"
              onClick={() => setPages((n) => n + 1)}
            >
              Show more ({ordered.length - visible.length} older)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One-button edit of a game's `played_at` via a datetime picker (CLAUDE.md §5
 * polish). Saving is a plain UPDATE to games.played_at — the existing
 * games-realtime subscription (and the explicit onRefresh here) recomputes the
 * leaderboard and re-orders the deterministic replay. No new subscription, no
 * cached ratings touched.
 */
function EditPlayedAtModal({
  game,
  onRefresh,
}: {
  game: Game;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => isoToLocalInput(game.played_at));
  const [saving, setSaving] = useState(false);

  // When (re)opening, sync the input to the game's current stored value so an
  // external realtime update doesn't leave a stale draft in the field.
  function onOpenChange(next: boolean) {
    if (next) setValue(isoToLocalInput(game.played_at));
    setOpen(next);
  }

  async function save() {
    const iso = localInputToIso(value);
    if (!iso) {
      toast.error("Pick a valid date and time.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("games")
        .update({ played_at: iso })
        .eq("id", game.id);
      if (error) {
        toast.error(`Could not update time: ${error.message}`);
        return;
      }
      toast.success("Game time updated");
      setOpen(false);
      // Realtime will also fire; refresh now for immediate re-ordering/recompute.
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onOpenChange(true)}
        aria-label="Edit game time"
      >
        <CalendarClock className="size-3.5" /> Time
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit game time</DialogTitle>
          <DialogDescription>
            Changing when a game was played can re-order the timeline and
            recompute the leaderboard.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`played-at-${game.id}`}>Played at</Label>
          <Input
            id={`played-at-${game.id}`}
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
