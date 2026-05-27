// Pure date/time conversion helpers shared by the History view (CLAUDE.md §5
// polish: played_at editing). Kept framework-free so they're trivially testable
// and don't drag client-only imports into the test environment.

/**
 * Convert a stored ISO timestamp (UTC) to the value a
 * <input type="datetime-local"> expects: local wall-clock "YYYY-MM-DDTHH:mm"
 * with no timezone suffix. Returns "" for an unparseable input.
 */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Convert a datetime-local value (interpreted in the browser's local timezone)
 * back to an ISO string for storage. Returns null if the value is unparseable.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value); // local time per the spec for datetime-local
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
