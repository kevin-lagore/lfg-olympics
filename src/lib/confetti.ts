// Confetti celebration for underdog wins (CLAUDE.md §6).
//
// canvas-confetti is a browser-only library (touches `document`/`window`), so we
// import it dynamically and guard on `window` to stay safe in any SSR/test path.
// Honours prefers-reduced-motion by skipping the burst entirely.

/**
 * Fire ~2 seconds of celebratory confetti. No-op on the server, in tests, or
 * when the user has requested reduced motion.
 */
export async function fireUpsetConfetti(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const confetti = (await import("canvas-confetti")).default;

  const durationMs = 2000;
  const end = Date.now() + durationMs;

  // An initial celebratory pop...
  confetti({
    particleCount: 120,
    spread: 90,
    startVelocity: 45,
    origin: { y: 0.6 },
  });

  // ...followed by a steady ~2s drizzle from both lower corners.
  const frame = () => {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
    });
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
