import { describe, it, expect } from "vitest";
import { isoToLocalInput, localInputToIso } from "./datetime";

// These helpers convert between stored ISO (UTC) and the local wall-clock
// string a <input type="datetime-local"> uses. They round-trip through the
// browser's local timezone, so we assert round-trip identity (timezone-agnostic)
// rather than hard-coding an offset.

describe("isoToLocalInput / localInputToIso", () => {
  it("round-trips a timestamp back to the same instant (minute precision)", () => {
    const iso = "2026-05-20T14:30:00.000Z";
    const local = isoToLocalInput(iso);
    // datetime-local has no seconds by default -> "YYYY-MM-DDTHH:mm".
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const back = localInputToIso(local);
    expect(back).not.toBeNull();
    // Same minute (seconds were dropped by the picker format).
    const a = new Date(iso);
    const b = new Date(back!);
    expect(b.getUTCFullYear()).toBe(a.getUTCFullYear());
    expect(Math.floor(b.getTime() / 60000)).toBe(Math.floor(a.getTime() / 60000));
  });

  it("returns empty string for an unparseable ISO", () => {
    expect(isoToLocalInput("not-a-date")).toBe("");
  });

  it("returns null for an empty or invalid local value", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("garbage")).toBeNull();
  });

  it("produces a valid ISO string from a well-formed local value", () => {
    const iso = localInputToIso("2026-05-20T14:30");
    expect(iso).not.toBeNull();
    expect(() => new Date(iso!).toISOString()).not.toThrow();
    expect(new Date(iso!).toISOString()).toBe(iso);
  });
});
