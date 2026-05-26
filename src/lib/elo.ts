// Event-sourced Elo ratings (CLAUDE.md §2 + §4).
//
// Ratings are NEVER stored. They are computed by replaying all non-excluded
// games in deterministic chronological order. Same input always yields the
// same output.

import type { Game, Player, RatingInfo } from "./types";

export const STARTING_RATING = 1500;
export const K_FACTOR = 64;
export const UNDERDOG_MULTIPLIER = 1.3;

/**
 * Expected score for "self" given self and opponent ratings.
 * expected_self = 1 / (1 + 10^((rating_opponent - rating_self) / 400))
 */
export function expectedScore(ratingSelf: number, ratingOpponent: number): number {
  return 1 / (1 + Math.pow(10, (ratingOpponent - ratingSelf) / 400));
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
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

    const winnerTeam = mean(winnerRatings);
    const loserTeam = mean(loserRatings);

    // One 1v1-style delta from the winning team's perspective (actual = 1).
    const expectedWin = expectedScore(winnerTeam, loserTeam);
    let delta = K_FACTOR * (1 - expectedWin);

    // Underdog: winners' pre-game average strictly below losers' pre-game average.
    if (winnerTeam < loserTeam) {
      delta *= UNDERDOG_MULTIPLIER;
    }

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
