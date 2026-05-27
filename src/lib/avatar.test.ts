import { describe, expect, it } from "vitest";
import {
  AVATAR_COLOR_COUNT,
  avatarColorIndex,
  chartLabels,
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

describe("chartLabels", () => {
  it("uses the first word trimmed to maxLen", () => {
    expect(chartLabels(["Alexander", "Bob"])).toEqual(["Alexa", "Bob"]);
    expect(chartLabels(["Tom B", "Mary Jane W"])).toEqual(["Tom", "Mary"]);
  });

  it("keeps single-word look-alikes distinguishable (the acceptance bar)", () => {
    const labels = chartLabels(["Sam", "Sal"]);
    expect(labels).toEqual(["Sam", "Sal"]);
    expect(labels[0]).not.toBe(labels[1]);
  });

  it("disambiguates names that truncate to the same prefix", () => {
    const labels = chartLabels(["Player 1", "Player 10"]);
    // Both first words are identical ("Player"), so they get ordinal suffixes.
    expect(new Set(labels).size).toBe(2);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[0].startsWith("Player")).toBe(true);
    expect(labels[1].startsWith("Player")).toBe(true);
  });

  it("expands to the full first word only when the prefix collides", () => {
    // "Samuel" and "Samantha" both trim to "Samue"/"Saman" at maxLen=5 — those
    // already differ, so no expansion is needed.
    expect(chartLabels(["Samuel", "Samantha"])).toEqual(["Samue", "Saman"]);
    // But with a shorter maxLen they collide on "Sam" and expand to full words.
    expect(chartLabels(["Samuel", "Samantha"], 3)).toEqual([
      "Samuel",
      "Samantha",
    ]);
  });

  it("produces a unique label for every displayed player", () => {
    const names = ["Sam", "Sal", "Sue", "Player 1", "Player 10", "Sam"];
    const labels = chartLabels(names);
    expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(names.length);
  });

  it("preserves input order", () => {
    expect(chartLabels(["Zoe", "Amy", "Bob"])).toEqual(["Zoe", "Amy", "Bob"]);
  });

  it("falls back to ? for empty names", () => {
    expect(chartLabels([""])).toEqual(["?"]);
  });
});

describe("hashString", () => {
  it("returns a non-negative integer", () => {
    expect(hashString("anything")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashString("anything"))).toBe(true);
  });
});
