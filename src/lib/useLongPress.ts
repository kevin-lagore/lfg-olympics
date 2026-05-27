"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Long-press gesture, mobile-first. Fires `onLongPress` once after the pointer
 * has been held down for `ms` milliseconds without lifting or moving away.
 *
 * Implemented with Pointer Events so it works identically for touch, pen, and
 * mouse on a single code path (CLAUDE.md admin spec: "must work on touch, not
 * just mouse"). A normal tap/click lifts the pointer before the timer elapses,
 * so it does NOT fire. Moving the finger more than a small slop distance, or the
 * pointer leaving the element, cancels the press so scrolling never triggers it.
 *
 * Returns props to spread onto the target element. `onContextMenu` is suppressed
 * so the long-press doesn't also pop the mobile context menu / text callout.
 */
export function useLongPress(onLongPress: () => void, ms = 600) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Keep the latest callback without re-creating handlers each render. Updated
  // in an effect (never during render) so the fired-after-delay callback always
  // sees the current closure.
  const cb = useRef(onLongPress);
  useEffect(() => {
    cb.current = onLongPress;
  }, [onLongPress]);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  // Safety net: clear any pending timer on unmount.
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Primary button / single touch only.
      if (e.button !== undefined && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        start.current = null;
        cb.current();
      }, ms);
    },
    [clear, ms],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current || timer.current === null) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      // ~10px slop: small jitter is fine, an actual drag/scroll cancels.
      if (dx * dx + dy * dy > 100) clear();
    },
    [clear],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
