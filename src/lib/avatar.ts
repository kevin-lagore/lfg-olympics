// Pure helpers for the playful per-player avatars (V6 visual direction).
//
// Avatars are generated, not stored: initials derived from the player name and
// a deterministic colour chosen from a fixed palette so the same name always
// gets the same look across devices.

/**
 * Up to two initials from a player name.
 * - "Tom B"        -> "TB"
 * - "Tom"          -> "TO"  (first two letters when there's a single word)
 * - "Mary Jane W"  -> "MW"  (first + last word)
 * - ""             -> "?"
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const first = words[0][0] ?? "";
  const last = words[words.length - 1][0] ?? "";
  return (first + last).toUpperCase();
}

/**
 * Short, human-readable chart labels for a set of CURRENTLY DISPLAYED players.
 *
 * Unlike {@link initials} (used for the round avatars elsewhere), this aims to
 * keep look-alike players distinguishable on the rating chart:
 *  - Base label = the first word of the name, trimmed to `maxLen` chars, so
 *    "Sam" / "Sal" / "Sue" read differently (where two-letter initials would
 *    all collapse to "SA"/"SU").
 *  - If two players in this set would still share a base label, they are
 *    disambiguated deterministically by lengthening to the full first word,
 *    then by appending a 1-based ordinal suffix (e.g. "Player·1" -> "Plᐟ1").
 *
 * The input order is preserved in the output. Operates only on the players
 * passed in (the visible chart), so labels stay as short as the field allows.
 *
 * @param names  player display names, in chart order.
 * @param maxLen max characters for the base (first-word) label (default 5).
 */
export function chartLabels(names: string[], maxLen = 5): string[] {
  const firstWords = names.map((name) => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    return words[0] ?? "?";
  });

  // Start with the first word trimmed to `maxLen`.
  const labels = firstWords.map((w) => w.slice(0, maxLen));

  const collisions = (ls: string[]) => {
    const counts = new Map<string, number>();
    for (const l of ls) {
      const k = l.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  };

  // Step 1: for any label that collides, fall back to the full first word
  // (which separates e.g. "Player" from a hypothetical "Playerton", and keeps
  // multi-word collisions readable).
  let counts = collisions(labels);
  for (let i = 0; i < labels.length; i++) {
    if ((counts.get(labels[i].toLowerCase()) ?? 0) > 1) {
      labels[i] = firstWords[i];
    }
  }

  // Step 2: anything that STILL collides (identical first words, e.g.
  // "Player 1" / "Player 10") gets a deterministic 1-based ordinal suffix so
  // every visible bar reads uniquely.
  counts = collisions(labels);
  const seen = new Map<string, number>();
  for (let i = 0; i < labels.length; i++) {
    const k = labels[i].toLowerCase();
    if ((counts.get(k) ?? 0) > 1) {
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      labels[i] = `${labels[i]}${n}`;
    }
  }

  return labels;
}

/**
 * Stable djb2-style hash of a string -> non-negative integer. Used to pick an
 * avatar colour deterministically from a name (or player id).
 */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** Number of distinct avatar colour buckets. */
export const AVATAR_COLOR_COUNT = 6;

/**
 * Deterministic colour bucket [0, AVATAR_COLOR_COUNT) for a seed string. The
 * matching Tailwind classes live in the AVATAR_COLORS table in PlayerAvatar.
 */
export function avatarColorIndex(seed: string): number {
  return hashString(seed) % AVATAR_COLOR_COUNT;
}
