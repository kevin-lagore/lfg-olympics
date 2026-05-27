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
