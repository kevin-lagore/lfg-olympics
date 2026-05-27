// Commentary staleness + prompt helpers (CLAUDE.md §5 View 5).
//
// Commentary is cached one row per activity. A cache is "stale" — and the UI
// should offer "Regenerate" rather than just "Generate" — when more
// non-excluded games have been logged for the activity than existed when the
// commentary was generated. The math lives here as a small pure function so it
// can be unit-tested and shared by client (button label) and server (route).

import type { Commentary, Game, Player, RatingInfo } from "./types";

/**
 * Count of non-excluded games for a single activity. This is the number stored
 * as `commentary.games_at_generation` when commentary is generated, and the
 * number compared against to decide staleness.
 */
export function nonExcludedGameCount(games: Game[], activityId: string): number {
  return games.filter((g) => g.activity_id === activityId && !g.excluded).length;
}

/**
 * True when cached commentary is stale relative to the current game count.
 *
 * Stale means: `commentary.games_at_generation` is strictly less than the
 * current count of non-excluded games for that activity (CLAUDE.md §5). If
 * there is no commentary yet, it is NOT "stale" — the UI shows "Generate", not
 * "Regenerate". An equal count is fresh.
 */
export function isCommentaryStale(
  commentary: Pick<Commentary, "games_at_generation"> | null | undefined,
  currentGameCount: number,
): boolean {
  if (!commentary) return false;
  return commentary.games_at_generation < currentGameCount;
}

/**
 * Build the Claude prompt for an activity (CLAUDE.md §5 prompt template).
 *
 * Standings are derived from the global ratings (computed via the elo engine,
 * never stored) restricted to players who have actually played this activity,
 * paired with their W/L in this activity. Recent results are the last 10
 * non-excluded games for the activity, newest first.
 */
export function buildCommentaryPrompt(input: {
  activityName: string;
  standings: {
    name: string;
    rating: number;
    wins: number;
    losses: number;
  }[];
  recentGames: {
    winners: string[];
    losers: string[];
    isDoubles: boolean;
  }[];
}): string {
  const standingsText =
    input.standings.length > 0
      ? input.standings
          .map(
            (s, i) =>
              `${i + 1}. ${s.name} — rating ${Math.round(s.rating)}, ${s.wins}W/${s.losses}L`,
          )
          .join("\n")
      : "(no games played yet)";

  const recentText =
    input.recentGames.length > 0
      ? input.recentGames
          .map((g, i) => {
            const w = g.winners.join(" & ");
            const l = g.losers.join(" & ");
            const kind = g.isDoubles ? "doubles" : "singles";
            return `${i + 1}. ${w} beat ${l} (${kind})`;
          })
          .join("\n")
      : "(no recent results)";

  return [
    `You are a snarky but affectionate sports commentator covering "LFG Olympics", a family-weekend lawn-games tournament.`,
    ``,
    `Activity: ${input.activityName}.`,
    ``,
    `Current standings (rating + win/loss in this activity):`,
    standingsText,
    ``,
    `Recent results (newest first):`,
    recentText,
    ``,
    `Write 3–4 sentences of fun, irreverent commentary. Call out specific players by name. Don't be mean-spirited. Output only the commentary text, no preamble.`,
  ].join("\n");
}

/**
 * Compute per-activity standings for the prompt: players who have appeared in a
 * non-excluded game for the activity, with their GLOBAL elo rating (from the
 * supplied ratings map — computed, never stored) and their W/L within the
 * activity. Sorted by rating desc, then wins desc, then name for stability.
 */
export function activityStandings(
  games: Game[],
  players: Player[],
  ratings: Map<string, RatingInfo>,
  activityId: string,
): { name: string; rating: number; wins: number; losses: number }[] {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const seen = new Set<string>();

  for (const g of games) {
    if (g.activity_id !== activityId || g.excluded) continue;
    for (const id of g.winner_ids) {
      wins.set(id, (wins.get(id) ?? 0) + 1);
      seen.add(id);
    }
    for (const id of g.loser_ids) {
      losses.set(id, (losses.get(id) ?? 0) + 1);
      seen.add(id);
    }
  }

  return [...seen]
    .map((id) => ({
      name: nameOf.get(id) ?? "Unknown",
      rating: ratings.get(id)?.rating ?? 1500,
      wins: wins.get(id) ?? 0,
      losses: losses.get(id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        b.wins - a.wins ||
        a.name.localeCompare(b.name),
    );
}

/**
 * The last N non-excluded games for an activity, newest first (played_at DESC,
 * then created_at DESC for deterministic tie-breaking), mapped to display names.
 */
export function recentGamesForPrompt(
  games: Game[],
  players: Player[],
  activityId: string,
  limit = 10,
): { winners: string[]; losers: string[]; isDoubles: boolean }[] {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const name = (id: string) => nameOf.get(id) ?? "Unknown";
  return games
    .filter((g) => g.activity_id === activityId && !g.excluded)
    .sort((a, b) => {
      const pa = b.played_at.localeCompare(a.played_at);
      if (pa !== 0) return pa;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit)
    .map((g) => ({
      winners: g.winner_ids.map(name),
      losers: g.loser_ids.map(name),
      isDoubles: g.is_doubles,
    }));
}
