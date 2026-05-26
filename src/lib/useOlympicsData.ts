"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Activity, Game, Player } from "./types";

export type OlympicsData = {
  players: Player[];
  activities: Activity[];
  games: Game[];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const [p, a, g] = await Promise.all([
      supabase.from("players").select("*").order("created_at"),
      supabase.from("activities").select("*").order("name"),
      supabase.from("games").select("*"),
    ]);
    if (p.error || a.error || g.error) {
      setError(p.error?.message ?? a.error?.message ?? g.error?.message ?? "Load failed");
      return;
    }
    setPlayers((p.data ?? []) as Player[]);
    setActivities((a.data ?? []) as Activity[]);
    setGames((g.data ?? []) as Game[]);
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

  return { players, activities, games, loading, error, refresh };
}
