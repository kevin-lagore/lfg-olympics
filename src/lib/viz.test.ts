import { describe, expect, it } from "vitest";
import { ratingBarHeights } from "./viz";

describe("ratingBarHeights", () => {
  it("returns an empty array for no ratings", () => {
    expect(ratingBarHeights([])).toEqual([]);
  });

  it("gives a single player a full-height bar", () => {
    expect(ratingBarHeights([1500])).toEqual([{ heightPct: 100 }]);
  });

  it("gives every bar full height when all ratings are equal", () => {
    const bars = ratingBarHeights([1500, 1500, 1500]);
    expect(bars.every((b) => b.heightPct === 100)).toBe(true);
  });

  it("maps min to minPct and max to 100", () => {
    const bars = ratingBarHeights([1600, 1500, 1400], 18);
    expect(bars[0].heightPct).toBe(100); // max
    expect(bars[2].heightPct).toBe(18); // min
    // middle is exactly halfway between floor and 100
    expect(bars[1].heightPct).toBeCloseTo(59);
  });

  it("respects a custom floor", () => {
    const bars = ratingBarHeights([2000, 1000], 30);
    expect(bars[1].heightPct).toBe(30);
    expect(bars[0].heightPct).toBe(100);
  });

  it("never produces heights below the floor", () => {
    const bars = ratingBarHeights([1700, 1690, 1500, 1499], 18);
    for (const b of bars) {
      expect(b.heightPct).toBeGreaterThanOrEqual(18);
      expect(b.heightPct).toBeLessThanOrEqual(100);
    }
  });
});
