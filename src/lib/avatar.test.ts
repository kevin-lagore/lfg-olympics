import { describe, expect, it } from "vitest";
import {
  AVATAR_COLOR_COUNT,
  avatarColorIndex,
  hashString,
  initials,
} from "./avatar";

describe("initials", () => {
  it("uses first + last word initials for multi-word names", () => {
    expect(initials("Tom B")).toBe("TB");
    expect(initials("Mary Jane W")).toBe("MW");
  });

  it("uses the first two letters for single-word names", () => {
    expect(initials("Tom")).toBe("TO");
    expect(initials("A")).toBe("A");
  });

  it("collapses extra whitespace", () => {
    expect(initials("  Tom   B  ")).toBe("TB");
  });

  it("falls back to ? for empty / whitespace names", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("avatarColorIndex", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarColorIndex("player-123")).toBe(avatarColorIndex("player-123"));
  });

  it("always lands within the palette range", () => {
    for (const seed of ["a", "Tom B", "player-xyz", "", "🎉"]) {
      const idx = avatarColorIndex(seed);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(AVATAR_COLOR_COUNT);
    }
  });
});

describe("hashString", () => {
  it("returns a non-negative integer", () => {
    expect(hashString("anything")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashString("anything"))).toBe(true);
  });
});
