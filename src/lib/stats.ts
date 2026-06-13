// Per-activity descriptive statistics (CLAUDE.md §5 View 4).
//
// These are DESCRIPTIVE stats only — there is no per-activity Elo (§4: single
// global rating per player). Nothing here is stored; it is computed on the
// client from the same `games` already loaded for the leaderboard.
//
// Doubles games count toward BOTH team members' W/L. Excluded games are NOT
// counted (they are excluded from the system per §2).

import type { Adjustment, Game, Player } from "./types";
import { computeRatings, STARTING_RATING } from "./elo";

export type PlayerRecord = {
  playerId: string;
  wins: number;
  losses: number;
  games: number; // wins + losses
};

export type HeadToHead = {
  // The two players, ordered so `aId` leads (more wins; ties broken by id).
  aId: string;
  bId: string;
  aWins: number; // games where aId's side beat bId's side
  bWins: number; // games where bId's side beat aId's side
};

export type ActivityStats = {
  totalGames: number;
  singles: number;
  doubles: number;
  // Per-player W/L, sorted by wins desc, then games desc, then id for stability.
  records: PlayerRecord[];
  // Head-to-head pairs (opponents only), sorted by total games desc.
  headToHead: HeadToHead[];
};

/**
 * Aggregate descriptive stats for a single activity from the full games list.
 *
 * @param games        ALL games in the system (any activity, any order).
 * @param activityId   the activity to filter to; "" / unknown yields empty stats.
 * @returns descriptive stats for that activity (empty but valid if no games).
 */
export function computeActivityStats(
  games: Game[],
  activityId: string,
): ActivityStats {
  const relevant = games.filter(
    (g) => g.activity_id === activityId && !g.excluded,
  );

  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const seen = new Set<string>();

  const bump = (m: Map<string, number>, id: string) => {
    m.set(id, (m.get(id) ?? 0) + 1);
    seen.add(id);
  };

  // Head-to-head keyed by an order-independent pair key. We store directional
  // win counts so we can report "A beat B X–Y".
  const h2h = new Map<string, { aId: string; bId: string; aWins: number; bWins: number }>();
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

  let singles = 0;
  let doubles = 0;

  for (const g of relevant) {
    if (g.is_doubles) doubles += 1;
    else singles += 1;

    for (const id of g.winner_ids) bump(wins, id);
    for (const id of g.loser_ids) bump(losses, id);

    // Every winner faced every loser in this game (singles: 1×1, doubles: 2×2).
    for (const w of g.winner_ids) {
      for (const l of g.loser_ids) {
        if (w === l) continue; // defensive; should never happen
        const key = pairKey(w, l);
        let entry = h2h.get(key);
        if (!entry) {
          const [aId, bId] = w < l ? [w, l] : [l, w];
          entry = { aId, bId, aWins: 0, bWins: 0 };
          h2h.set(key, entry);
        }
        if (w === entry.aId) entry.aWins += 1;
        else entry.bWins += 1;
      }
    }
  }

  const records: PlayerRecord[] = [...seen]
    .map((playerId) => {
      const wl = wins.get(playerId) ?? 0;
      const ll = losses.get(playerId) ?? 0;
      return { playerId, wins: wl, losses: ll, games: wl + ll };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.games - a.games ||
        a.playerId.localeCompare(b.playerId),
    );

  const headToHead: HeadToHead[] = [...h2h.values()]
    .map((e) => {
      // Order so the side with more wins leads; ties broken by id for stability.
      if (e.bWins > e.aWins || (e.bWins === e.aWins && e.bId < e.aId)) {
        return { aId: e.bId, bId: e.aId, aWins: e.bWins, bWins: e.aWins };
      }
      return { aId: e.aId, bId: e.bId, aWins: e.aWins, bWins: e.bWins };
    })
    .sort(
      (x, y) =>
        y.aWins + y.bWins - (x.aWins + x.bWins) ||
        x.aId.localeCompare(y.aId) ||
        x.bId.localeCompare(y.bId),
    );

  return {
    totalGames: relevant.length,
    singles,
    doubles,
    records,
    headToHead,
  };
}

// ---------------------------------------------------------------------------
// Overall (cross-activity) stats — CLAUDE.md §5.
//
// Like the per-activity stats above these are DESCRIPTIVE and computed on the
// client; nothing is stored. The one difference is `rating`: there is a SINGLE
// global Elo per player (§4), so the overall rating IS that global rating
// (computeRatings) — it is NOT an average of per-activity ratings (none exist).
// ---------------------------------------------------------------------------

export type OverallPlayerRow = {
  playerId: string;
  wins: number;
  losses: number;
  games: number; // wins + losses
  winPct: number; // Math.round(wins/games*100); 0 when no games
  activities: number; // distinct activities this player has appeared in
  rating: number; // the single global Elo rating (computeRatings)
};

export type OverallStats = {
  totalGames: number;
  singles: number;
  doubles: number;
  activities: number; // distinct activities with at least one non-excluded game
  players: number; // number of players considered
  // Per-player rows, sorted by rating desc, then games desc, then id.
  rows: OverallPlayerRow[];
};

/**
 * Aggregate descriptive stats across ALL activities from the full games list.
 *
 * Doubles games count ONCE per participant (each member gets a win/loss), the
 * same convention as `computeActivityStats`. Excluded games are ignored. The
 * `rating` on each row is the single global Elo rating from `computeRatings`
 * (there is no per-activity rating to average — §4).
 *
 * @param games        ALL games in the system (any activity, any order).
 * @param players      the players to produce rows for (one row each).
 * @param adjustments  manual rating adjustments, passed through to the rating
 *                     replay (defaults to [] for existing call sites/tests).
 * @returns overall stats (empty but valid if there are no games/players).
 */
export function computeOverallStats(
  games: Game[],
  players: Player[],
  adjustments: Adjustment[] = [],
): OverallStats {
  const relevant = games.filter((g) => !g.excluded);

  const ratings = computeRatings(games, players, adjustments);

  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  // Distinct activities each player has appeared in.
  const activitiesByPlayer = new Map<string, Set<string>>();
  // Distinct activities overall (with at least one non-excluded game).
  const allActivities = new Set<string>();

  let singles = 0;
  let doubles = 0;

  const bumpActivity = (id: string, activityId: string) => {
    let set = activitiesByPlayer.get(id);
    if (!set) {
      set = new Set<string>();
      activitiesByPlayer.set(id, set);
    }
    set.add(activityId);
  };

  for (const g of relevant) {
    if (g.is_doubles) doubles += 1;
    else singles += 1;
    allActivities.add(g.activity_id);

    for (const id of g.winner_ids) {
      wins.set(id, (wins.get(id) ?? 0) + 1);
      bumpActivity(id, g.activity_id);
    }
    for (const id of g.loser_ids) {
      losses.set(id, (losses.get(id) ?? 0) + 1);
      bumpActivity(id, g.activity_id);
    }
  }

  const rows: OverallPlayerRow[] = players
    .map((p) => {
      const w = wins.get(p.id) ?? 0;
      const l = losses.get(p.id) ?? 0;
      const games = w + l;
      return {
        playerId: p.id,
        wins: w,
        losses: l,
        games,
        winPct: games === 0 ? 0 : Math.round((w / games) * 100),
        activities: activitiesByPlayer.get(p.id)?.size ?? 0,
        rating: ratings.get(p.id)?.rating ?? STARTING_RATING,
      };
    })
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        b.games - a.games ||
        a.playerId.localeCompare(b.playerId),
    );

  return {
    totalGames: relevant.length,
    singles,
    doubles,
    activities: allActivities.size,
    players: players.length,
    rows,
  };
}

/**
 * The activity id with the most non-excluded games, for use as a default
 * selection. Returns null if there are no qualifying games.
 */
export function activityWithMostGames(games: Game[]): string | null {
  const counts = new Map<string, number>();
  for (const g of games) {
    if (g.excluded) continue;
    counts.set(g.activity_id, (counts.get(g.activity_id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = -1;
  // Iterate sorted by id so ties are deterministic.
  for (const id of [...counts.keys()].sort()) {
    const n = counts.get(id)!;
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  return best;
}
