"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { runCommentaryRegeneration } from "./commentary";
import type {
  Activity,
  Adjustment,
  Game,
  Player,
  TournamentCommentary,
} from "./types";

export type OlympicsData = {
  players: Player[];
  activities: Activity[];
  games: Game[];
  adjustments: Adjustment[];
  commentary: TournamentCommentary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * True while a new-game-triggered commentary regeneration POST is in flight
   * (the ~3s Claude call). The Commentary view surfaces this as an "updating…"
   * indicator so the gap between logging a game and the fresh text landing looks
   * intentional rather than broken (CLAUDE.md §5 View 5).
   */
  regenerating: boolean;
  /**
   * Fire the unified-commentary regeneration (POST /api/commentary) and, once it
   * resolves, refetch so the freshly-written row lands in shared state and the
   * Commentary view updates automatically — no manual Refresh, no page reload.
   * Non-blocking: returns immediately; never throws (errors quiet-fail). Call
   * this after a successful game insert.
   */
  regenerateCommentary: () => void;
};

/**
 * Loads players, activities, and games and subscribes to realtime changes on
 * the `games` table (CLAUDE.md §2). Any insert/update/delete to games triggers
 * a refresh so every client converges. Ratings are computed downstream from
 * `games` — never stored.
 */
export function useOlympicsData(): OlympicsData {
  const [players, setPlayers] = useState<Player[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [commentary, setCommentary] = useState<TournamentCommentary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Coalesce rapid logs: if several games are recorded while a regeneration is
  // already in flight, we don't fire overlapping POSTs — the in-flight call will
  // pick up the latest game state on the server, and we refetch once it lands.
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    setError(null);
    const [p, a, g, adj, c] = await Promise.all([
      supabase.from("players").select("*").order("created_at"),
      supabase.from("activities").select("*").order("name"),
      supabase.from("games").select("*"),
      supabase.from("adjustments").select("*"),
      // Single-row unified commentary (id = 1). maybeSingle() tolerates the
      // empty state (no row yet) without surfacing an error.
      supabase.from("tournament_commentary").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (p.error || a.error || g.error || adj.error || c.error) {
      setError(
        p.error?.message ??
          a.error?.message ??
          g.error?.message ??
          adj.error?.message ??
          c.error?.message ??
          "Load failed",
      );
      return;
    }
    setPlayers((p.data ?? []) as Player[]);
    setActivities((a.data ?? []) as Activity[]);
    setGames((g.data ?? []) as Game[]);
    setAdjustments((adj.data ?? []) as Adjustment[]);
    setCommentary((c.data as TournamentCommentary | null) ?? null);
  }, []);

  /**
   * Trigger a background regeneration of the unified commentary, then refetch so
   * the new row lands in shared state. Non-blocking and quiet-failing: the
   * regenerating flag is raised while the POST is in flight and lowered when it
   * settles (success OR error), and we always refetch on completion so the
   * Commentary view converges to whatever the server persisted. On the error
   * path (e.g. no ANTHROPIC_API_KEY -> 503), no new row is written; the refetch
   * is harmless and the existing stale-fallback still applies.
   */
  const regenerateCommentary = useCallback(() => {
    void runCommentaryRegeneration({
      isInFlight: () => inFlight.current,
      setInFlight: (v) => {
        inFlight.current = v;
      },
      setRegenerating,
      post: () => fetch("/api/commentary", { method: "POST" }),
      refresh,
      onError: (e) =>
        console.warn("Background commentary regeneration failed", e),
    });
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();

    // Realtime: re-fetch on any change to games OR adjustments (CLAUDE.md §2
    // "Real-time"). Adjustments are an event type alongside games (§3), so an
    // admin insert/exclude propagates to every client and recomputes ratings.
    const channel = supabase
      .channel("olympics-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "adjustments" },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return {
    players,
    activities,
    games,
    adjustments,
    commentary,
    loading,
    error,
    refresh,
    regenerating,
    regenerateCommentary,
  };
}
