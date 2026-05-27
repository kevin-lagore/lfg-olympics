"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a player's rating and, whenever the value changes, counts up (or down)
 * to the new number over ~600ms using requestAnimationFrame with an ease-out
 * curve (CLAUDE.md §6 "subtle animation on rating change"). The displayed value
 * is always rounded; computation keeps the float passed in.
 *
 * Respects prefers-reduced-motion: if the user opts out of motion, the value
 * snaps to the target with no tween.
 */
export function AnimatedRating({
  value,
  durationMs = 600,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  // The value we last animated TO; the source of the next tween's start point.
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // Respect reduced-motion: snap straight to the target (no tween).
    const reduce =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const start = performance.now();
    const tick = (nowTs: number) => {
      if (reduce) {
        fromRef.current = to;
        setDisplay(to);
        rafRef.current = null;
        return;
      }
      const t = Math.min(1, (nowTs - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // Carry the in-progress value forward so an interrupted tween resumes
      // from where it was rather than snapping back to the old start.
      fromRef.current = display;
    };
    // We intentionally key the tween off `value` only; `display` is read inside
    // cleanup as a ref-like latest snapshot but must not retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span className={className} aria-label={`${Math.round(value)}`}>
      {Math.round(display)}
    </span>
  );
}
