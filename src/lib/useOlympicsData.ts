"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type {
  Activity,
  Game,
  Player,
  TournamentCommentary,
} from "./types";

export type OlympicsData = {
  players: Player[];
  activities: Activity[];
  games: Game[];
  commentary: TournamentCommentary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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
  const [commentary, setCommentary] = useState<TournamentCommentary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const [p, a, g, c] = await Promise.all([
      supabase.from("players").select("*").order("created_at"),
      supabase.from("activities").select("*").order("name"),
      supabase.from("games").select("*"),
      // Single-row unified commentary (id = 1). maybeSingle() tolerates the
      // empty state (no row yet) without surfacing an error.
      supabase.from("tournament_commentary").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (p.error || a.error || g.error || c.error) {
      setError(
        p.error?.message ??
          a.error?.message ??
          g.error?.message ??
          c.error?.message ??
          "Load failed",
      );
      return;
    }
    setPlayers((p.data ?? []) as Player[]);
    setActivities((a.data ?? []) as Activity[]);
    setGames((g.data ?? []) as Game[]);
    setCommentary((c.data as TournamentCommentary | null) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();

    // Realtime: re-fetch on any change to games (CLAUDE.md §2 "Real-time").
    const channel = supabase
      .channel("games-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
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

  return { players, activities, games, commentary, loading, error, refresh };
}
