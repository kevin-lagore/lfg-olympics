import { avatarColorIndex, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/**
 * Generated, colourful initials avatar for a player (V6 playful direction).
 * Colour is derived deterministically from a seed (player id preferred, so it's
 * stable even if two players share a name) — nothing stored.
 */

// Tailwind classes per colour bucket. Index range must match
// AVATAR_COLOR_COUNT in lib/avatar.ts.
const AVATAR_COLORS = [
  "bg-rose-400 text-rose-950",
  "bg-amber-400 text-amber-950",
  "bg-emerald-400 text-emerald-950",
  "bg-sky-400 text-sky-950",
  "bg-violet-400 text-violet-50",
  "bg-fuchsia-400 text-fuchsia-950",
] as const;

const SIZES = {
  sm: "size-7 text-[0.65rem]",
  md: "size-9 text-sm",
  lg: "size-12 text-base",
} as const;

export function PlayerAvatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  /** Stable colour seed; defaults to the name. Pass the player id when available. */
  seed?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const color = AVATAR_COLORS[avatarColorIndex(seed ?? name)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-extrabold tracking-tight shadow-sm ring-2 ring-white/70",
        color,
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
