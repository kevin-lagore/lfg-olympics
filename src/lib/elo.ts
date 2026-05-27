// Event-sourced Elo ratings (CLAUDE.md §2 + §4).
//
// Ratings are NEVER stored. They are computed by replaying all non-excluded
// games in deterministic chronological order. Same input always yields the
// same output.

import type { Game, Player, RatingInfo } from "./types";

// Index-to-100 factor (CLAUDE.md §4). Every classic 1500-scale Elo constant is
// divided by SCALE so the displayed numbers are friendlier (start at 100) while
// win probabilities, relative swings, and underdog behaviour stay IDENTICAL to
// a classic 1500/400/K=64 system. Do NOT round these — rounding breaks the
// "same feel" guarantee.
const SCALE = 15;

export const STARTING_RATING = 1500 / SCALE; // 100
export const K_FACTOR = 64 / SCALE; // ≈4.2667 (equivalent to K=64 on classic scale)
export const UNDERDOG_MULTIPLIER = 1.3; // dimensionless — unchanged

/**
 * Expected score for "self" given self and opponent ratings.
 * expected_self = 1 / (1 + 10^((rating_opponent - rating_self) / (400 / SCALE)))
 *
 * Both the rating difference and the divisor live on the same 1/15 scale, so the
 * result is identical to the classic 1500-scale value for the equivalent matchup.
 */
export function expectedScore(ratingSelf: number, ratingOpponent: number): number {
  return 1 / (1 + Math.pow(10, (ratingOpponent - ratingSelf) / (400 / SCALE)));
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * The raw, signed delta applied to each winner (+) and each loser (−) for a
 * single game, given the PRE-game ratings of every participant.
 *
 * This is the one and only place the per-game Elo math lives. Both the full
 * replay (computeRatings) and the per-row history deltas (computeGameDeltas)
 * call through here, so the two can never drift apart.
 *
 * @param winnerRatings pre-game ratings of the winning side (length 1 or 2)
 * @param loserRatings  pre-game ratings of the losing side (length 1 or 2)
 * @returns the delta to ADD to each winner and SUBTRACT from each loser
 */
export function gameDelta(
  winnerRatings: number[],
  loserRatings: number[],
): number {
  const winnerTeam = mean(winnerRatings);
  const loserTeam = mean(loserRatings);

  // One 1v1-style delta from the winning team's perspective (actual = 1).
  const expectedWin = expectedScore(winnerTeam, loserTeam);
  let delta = K_FACTOR * (1 - expectedWin);

  // Underdog: winners' pre-game average strictly below losers' pre-game average.
  if (winnerTeam < loserTeam) {
    delta *= UNDERDOG_MULTIPLIER;
  }

  return delta;
}

/**
 * True iff this result is an "upset" / underdog win per CLAUDE.md §4: the
 * winning side's PRE-game average rating is *strictly lower* than the losing
 * side's pre-game average rating. This is the exact condition that triggers the
 * 1.3 underdog multiplier inside `gameDelta`, expressed as a boolean so callers
 * (e.g. confetti at log time) can detect upsets without re-deriving the math.
 *
 * @param winnerRatings pre-game ratings of the winning side (length 1 or 2)
 * @param loserRatings  pre-game ratings of the losing side (length 1 or 2)
 */
export function isUpset(
  winnerRatings: number[],
  loserRatings: number[],
): boolean {
  return mean(winnerRatings) < mean(loserRatings);
}

/**
 * Convenience for the Record flow: given ALL games already loaded on the client
 * (the same source `computeRatings` replays) plus the winners/losers of a brand
 * new result, decide whether that new result is an upset. Pre-game ratings are
 * the CURRENT computed ratings (i.e. the state immediately before the new game),
 * reusing `computeRatings` so no rating math is duplicated and nothing is cached.
 */
export function isUpsetForNewGame(
  games: Game[],
  players: Player[],
  winnerIds: string[],
  loserIds: string[],
): boolean {
  const ratings = computeRatings(games, players);
  const get = (id: string) => ratings.get(id)?.rating ?? STARTING_RATING;
  return isUpset(winnerIds.map(get), loserIds.map(get));
}

/**
 * Replay all games (filtering excluded, sorting deterministically) and return
 * the current rating, non-excluded games played, and last per-game delta for
 * every player.
 *
 * Doubles: team_rating = mean(member pre-game ratings); one delta is computed
 * as if 1v1, then the FULL delta is applied to each member (+winners, -losers),
 * keeping the system zero-sum at the player level.
 *
 * Underdog multiplier (×1.3) applies when the winning side's pre-game average
 * rating is strictly lower than the losing side's pre-game average rating.
 */
export function computeRatings(
  games: Game[],
  players: Player[],
): Map<string, RatingInfo> {
  const ratings = new Map<string, number>();
  const gamesPlayed = new Map<string, number>();
  const lastChange = new Map<string, number | null>();

  // Initialise every known player at the starting rating.
  for (const player of players) {
    ratings.set(player.id, STARTING_RATING);
    gamesPlayed.set(player.id, 0);
    lastChange.set(player.id, null);
  }

  // Defensive: also initialise any player id that appears in games but is not
  // in the players list, so replay never produces NaN.
  const ensure = (id: string) => {
    if (!ratings.has(id)) {
      ratings.set(id, STARTING_RATING);
      gamesPlayed.set(id, 0);
      lastChange.set(id, null);
    }
  };

  const ordered = games
    .filter((g) => !g.excluded)
    .sort((a, b) => {
      // played_at ASC, then created_at ASC (deterministic tie-break).
      const pa = a.played_at.localeCompare(b.played_at);
      if (pa !== 0) return pa;
      return a.created_at.localeCompare(b.created_at);
    });

  for (const game of ordered) {
    const winners = game.winner_ids;
    const losers = game.loser_ids;
    [...winners, ...losers].forEach(ensure);

    const winnerRatings = winners.map((id) => ratings.get(id)!);
    const loserRatings = losers.map((id) => ratings.get(id)!);

    const delta = gameDelta(winnerRatings, loserRatings);

    // Apply FULL delta to each member (zero-sum at player level).
    for (const id of winners) {
      ratings.set(id, ratings.get(id)! + delta);
      gamesPlayed.set(id, gamesPlayed.get(id)! + 1);
      lastChange.set(id, delta);
    }
    for (const id of losers) {
      ratings.set(id, ratings.get(id)! - delta);
      gamesPlayed.set(id, gamesPlayed.get(id)! + 1);
      lastChange.set(id, -delta);
    }
  }

  const result = new Map<string, RatingInfo>();
  for (const [id, rating] of ratings) {
    result.set(id, {
      rating,
      gamesPlayed: gamesPlayed.get(id)!,
      lastChange: lastChange.get(id)!,
    });
  }
  return result;
}

/**
 * Per-player signed delta for a SINGLE game, evaluated against the ratings that
 * stood immediately before that game in the deterministic replay (CLAUDE.md §5
 * View 3: "the per-player Elo change for that game").
 *
 * This walks the same chronological replay as `computeRatings` and uses the same
 * `gameDelta` math, so the numbers are guaranteed consistent with the
 * leaderboard. Only non-excluded games advance the running ratings; an excluded
 * game's delta is reported as the value it WOULD have applied at that point in
 * history (its pre-game ratings being the current excluded-skipped state), but
 * it does not move the ratings forward.
 *
 * @returns Map keyed by game id -> Map keyed by player id -> signed delta
 *          (positive for that game's winners, negative for its losers).
 */
export function computeGameDeltas(
  games: Game[],
  players: Player[],
): Map<string, Map<string, number>> {
  const ratings = new Map<string, number>();
  for (const player of players) ratings.set(player.id, STARTING_RATING);
  const ensure = (id: string) => {
    if (!ratings.has(id)) ratings.set(id, STARTING_RATING);
  };

  // Replay in the SAME deterministic order as computeRatings, but keep every
  // game (excluded included) so we can report a delta for each row.
  const ordered = [...games].sort((a, b) => {
    const pa = a.played_at.localeCompare(b.played_at);
    if (pa !== 0) return pa;
    return a.created_at.localeCompare(b.created_at);
  });

  const result = new Map<string, Map<string, number>>();

  for (const game of ordered) {
    const winners = game.winner_ids;
    const losers = game.loser_ids;
    [...winners, ...losers].forEach(ensure);

    const winnerRatings = winners.map((id) => ratings.get(id)!);
    const loserRatings = losers.map((id) => ratings.get(id)!);
    const delta = gameDelta(winnerRatings, loserRatings);

    const perPlayer = new Map<string, number>();
    for (const id of winners) perPlayer.set(id, delta);
    for (const id of losers) perPlayer.set(id, -delta);
    result.set(game.id, perPlayer);

    // Only non-excluded games advance the running ratings — identical to the
    // leaderboard replay (excluded games are flagged, not applied).
    if (!game.excluded) {
      for (const id of winners) ratings.set(id, ratings.get(id)! + delta);
      for (const id of losers) ratings.set(id, ratings.get(id)! - delta);
    }
  }

  return result;
}
