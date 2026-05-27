// Pure helper for the playful rating viz (V6, CLAUDE.md §5 View 1).
//
// Maps a pool of ratings to bar heights in [minPct, 100] so even the lowest-
// rated player gets a visible, friendly bar rather than a sliver. Purely
// presentational scaling — it does NOT touch the elo math.

export type VizBar = {
  /** Bar height as a percentage of the tallest bar's track [minPct, 100]. */
  heightPct: number;
};

/**
 * Scale a list of ratings into bar heights.
 *
 * - When all ratings are equal (or there's a single player) every bar is full
 *   height, so an even field reads as a flat row of equal bars.
 * - Otherwise the pool min maps to `minPct` and the pool max to 100, linearly.
 *
 * @param ratings  ratings in display order (already sorted by the caller).
 * @param minPct   floor height for the lowest bar (default 18) so it stays fun.
 */
export function ratingBarHeights(ratings: number[], minPct = 18): VizBar[] {
  if (ratings.length === 0) return [];
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = max - min;
  return ratings.map((r) => {
    if (span === 0) return { heightPct: 100 };
    const frac = (r - min) / span;
    return { heightPct: minPct + frac * (100 - minPct) };
  });
}
