// Unified tournament commentary helpers (CLAUDE.md §5 View 5).
//
// View 5 shows a SINGLE commentary covering the whole tournament (all
// activities, all players), stored in the single-row `tournament_commentary`
// table. The commentary auto-regenerates whenever a new game is logged.
//
// A cached commentary is "stale" — and the UI shows a fallback Refresh control —
// when more non-excluded games exist now than existed when it was generated
// (e.g. after an exclude/include toggle, which is not a new-game insert). The
// math lives here as small pure functions so it can be unit-tested and shared by
// client (stale indicator) and server (route).

import type { Game, Player, RatingInfo, TournamentCommentary } from "./types";

/**
 * Orchestrates a single new-game-triggered commentary regeneration so the UI
 * converges automatically (CLAUDE.md §5 View 5). Pure/injectable so the
 * ordering contract is unit-testable without React or network:
 *
 *  1. Raises the "regenerating" flag (so the Commentary view shows "updating…").
 *  2. POSTs to regenerate. The server writes the new row (~3s, the Claude call).
 *  3. On settle — SUCCESS OR ERROR — refetches so the freshly-written row lands
 *     in shared state, THEN lowers the flag. Refetching even on the error path
 *     (e.g. missing API key -> 503) is harmless and keeps the view consistent.
 *  4. Coalesces: if a regeneration is already in flight, the call is a no-op
 *     (the in-flight POST sees the latest server state; one refetch follows).
 *
 * Returns immediately (the returned promise is for tests/awaiting; callers fire
 * it non-blocking). Errors from `post` quiet-fail via `onError`.
 */
export async function runCommentaryRegeneration(deps: {
  isInFlight: () => boolean;
  setInFlight: (v: boolean) => void;
  setRegenerating: (v: boolean) => void;
  post: () => Promise<unknown>;
  refresh: () => Promise<void>;
  onError?: (e: unknown) => void;
}): Promise<void> {
  if (deps.isInFlight()) return;
  deps.setInFlight(true);
  deps.setRegenerating(true);
  try {
    await deps.post();
  } catch (e) {
    deps.onError?.(e);
  } finally {
    try {
      await deps.refresh();
    } catch (e) {
      deps.onError?.(e);
    } finally {
      deps.setInFlight(false);
      deps.setRegenerating(false);
    }
  }
}

/**
 * Total count of non-excluded games across ALL activities. This is the number
 * stored as `tournament_commentary.games_at_generation` when commentary is
 * generated, and the number compared against to decide staleness.
 */
export function totalNonExcludedGameCount(games: Game[]): number {
  return games.filter((g) => !g.excluded).length;
}

/**
 * True when the cached unified commentary is stale relative to the current total
 * non-excluded game count.
 *
 * Stale means: `tournament_commentary.games_at_generation` is strictly less than
 * the current total count of non-excluded games. If there is no commentary yet,
 * it is NOT "stale" — the UI shows an empty state with "Generate", not a stale
 * indicator. An equal count is fresh. A higher generation count (e.g. games
 * excluded since) is also not stale.
 */
export function isCommentaryStale(
  commentary: Pick<TournamentCommentary, "games_at_generation"> | null | undefined,
  totalGameCount: number,
): boolean {
  if (!commentary) return false;
  return commentary.games_at_generation < totalGameCount;
}

/**
 * Overall tournament standings for the prompt: every player who has appeared in
 * a non-excluded game (in any activity), with their GLOBAL elo rating (from the
 * supplied ratings map — computed, never stored) and their overall W/L across
 * all activities. Sorted by rating desc, then wins desc, then name for
 * stability.
 */
export function overallStandings(
  games: Game[],
  players: Player[],
  ratings: Map<string, RatingInfo>,
): { name: string; rating: number; wins: number; losses: number }[] {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const seen = new Set<string>();

  for (const g of games) {
    if (g.excluded) continue;
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
 * The last N non-excluded games across ALL activities, newest first (played_at
 * DESC, then created_at DESC for deterministic tie-breaking), mapped to display
 * names and tagged with their activity name.
 */
export function recentGamesForPrompt(
  games: Game[],
  players: Player[],
  activityNameById: Map<string, string>,
  limit = 10,
): { activity: string; winners: string[]; losers: string[]; isDoubles: boolean }[] {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const name = (id: string) => nameOf.get(id) ?? "Unknown";
  return games
    .filter((g) => !g.excluded)
    .sort((a, b) => {
      const pa = b.played_at.localeCompare(a.played_at);
      if (pa !== 0) return pa;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit)
    .map((g) => ({
      activity: activityNameById.get(g.activity_id) ?? "Unknown",
      winners: g.winner_ids.map(name),
      losers: g.loser_ids.map(name),
      isDoubles: g.is_doubles,
    }));
}

/**
 * Build the unified Claude prompt for the whole tournament (CLAUDE.md §5 prompt
 * template). Standings are the overall standings; recent results span all
 * activities, newest first, each tagged with its activity.
 */
export function buildCommentaryPrompt(input: {
  standings: {
    name: string;
    rating: number;
    wins: number;
    losses: number;
  }[];
  recentGames: {
    activity: string;
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
            return `${i + 1}. [${g.activity}] ${w} beat ${l} (${kind})`;
          })
          .join("\n")
      : "(no recent results)";

  return [
    `You are a snarky but affectionate sports commentator covering "LFG Olympics", a family-weekend lawn-games tournament spanning several lawn games.`,
    ``,
    `Current overall standings (global rating + total win/loss across all activities):`,
    standingsText,
    ``,
    `Recent results across all activities (newest first):`,
    recentText,
    ``,
    `Write 3–4 sentences of fun, irreverent commentary on the tournament as a whole. Call out specific players by name. Don't be mean-spirited. Within reason attempt to mention all players. Output only the commentary text, no preamble.`,
  ].join("\n");
}
