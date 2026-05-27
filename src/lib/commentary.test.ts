import { describe, it, expect } from "vitest";
import {
  isCommentaryStale,
  nonExcludedGameCount,
  activityStandings,
  recentGamesForPrompt,
  buildCommentaryPrompt,
} from "./commentary";
import { computeRatings } from "./elo";
import type { Game, Player } from "./types";

let seq = 0;
function game(
  winner_ids: string[],
  loser_ids: string[],
  opts: Partial<Game> = {},
): Game {
  seq += 1;
  const stamp = `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`;
  return {
    id: opts.id ?? `g${seq}`,
    activity_id: opts.activity_id ?? "cornhole",
    is_doubles: opts.is_doubles ?? winner_ids.length > 1,
    winner_ids,
    loser_ids,
    played_at: opts.played_at ?? stamp,
    excluded: opts.excluded ?? false,
    created_at: opts.created_at ?? stamp,
  };
}
function player(id: string, name = id): Player {
  return { id, name, active: true, created_at: "2026-01-01T00:00:00.000Z" };
}

describe("nonExcludedGameCount", () => {
  it("counts only non-excluded games for the given activity", () => {
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["tom"], ["dave"], { activity_id: "cornhole", excluded: true }),
      game(["tom"], ["dave"], { activity_id: "badminton" }),
    ];
    expect(nonExcludedGameCount(games, "cornhole")).toBe(1);
    expect(nonExcludedGameCount(games, "badminton")).toBe(1);
    expect(nonExcludedGameCount(games, "nope")).toBe(0);
  });
});

describe("isCommentaryStale", () => {
  it("is not stale when there is no commentary (Generate, not Regenerate)", () => {
    expect(isCommentaryStale(null, 5)).toBe(false);
    expect(isCommentaryStale(undefined, 0)).toBe(false);
  });

  it("is fresh when generation count equals current count", () => {
    expect(isCommentaryStale({ games_at_generation: 5 }, 5)).toBe(false);
  });

  it("is stale when fewer games existed at generation than now", () => {
    expect(isCommentaryStale({ games_at_generation: 4 }, 5)).toBe(true);
    expect(isCommentaryStale({ games_at_generation: 0 }, 1)).toBe(true);
  });

  it("is not stale when generation count exceeds current (e.g. games excluded since)", () => {
    expect(isCommentaryStale({ games_at_generation: 6 }, 5)).toBe(false);
  });

  it("matches the count produced by nonExcludedGameCount (integration)", () => {
    const games = [
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
    ];
    // Commentary generated when only 1 game existed -> now 2 -> stale.
    expect(
      isCommentaryStale(
        { games_at_generation: 1 },
        nonExcludedGameCount(games, "cornhole"),
      ),
    ).toBe(true);
  });
});

describe("activityStandings", () => {
  it("includes only players in the activity, with global rating and activity W/L, sorted by rating", () => {
    const players = [player("tom"), player("dave"), player("ann")];
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["ann"], ["dave"], { activity_id: "badminton" }), // other activity
    ];
    const ratings = computeRatings(games, players);
    const standings = activityStandings(games, players, ratings, "cornhole");
    // ann never played cornhole -> excluded
    expect(standings.map((s) => s.name)).toEqual(["tom", "dave"]);
    const tom = standings.find((s) => s.name === "tom")!;
    const dave = standings.find((s) => s.name === "dave")!;
    expect(tom).toMatchObject({ wins: 2, losses: 0 });
    expect(dave).toMatchObject({ wins: 0, losses: 2 });
    // tom won both -> higher global rating -> sorted first
    expect(standings[0].name).toBe("tom");
  });

  it("excludes excluded games from W/L", () => {
    const players = [player("tom"), player("dave")];
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole", excluded: true }),
    ];
    const ratings = computeRatings(games, players);
    const standings = activityStandings(games, players, ratings, "cornhole");
    expect(standings).toEqual([]);
  });
});

describe("recentGamesForPrompt", () => {
  it("returns last N non-excluded games newest first with names", () => {
    const players = [player("tom", "Tom"), player("dave", "Dave")];
    const games = [
      game(["tom"], ["dave"], { id: "old", played_at: "2026-01-01T00:00:01.000Z", created_at: "2026-01-01T00:00:01.000Z" }),
      game(["dave"], ["tom"], { id: "new", played_at: "2026-01-01T00:00:09.000Z", created_at: "2026-01-01T00:00:09.000Z" }),
      game(["tom"], ["dave"], { id: "excl", excluded: true }),
    ];
    const recent = recentGamesForPrompt(games, players, "cornhole", 10);
    expect(recent).toHaveLength(2);
    // newest first -> "new" (Dave beat Tom) leads
    expect(recent[0]).toEqual({ winners: ["Dave"], losers: ["Tom"], isDoubles: false });
  });

  it("respects the limit", () => {
    const players = [player("tom"), player("dave")];
    const games = Array.from({ length: 15 }, () => game(["tom"], ["dave"]));
    expect(recentGamesForPrompt(games, players, "cornhole", 10)).toHaveLength(10);
  });
});

describe("buildCommentaryPrompt", () => {
  it("includes activity name, standings, and recent results", () => {
    const prompt = buildCommentaryPrompt({
      activityName: "Cornhole",
      standings: [{ name: "Tom", rating: 1532.6, wins: 3, losses: 1 }],
      recentGames: [{ winners: ["Tom"], losers: ["Dave"], isDoubles: false }],
    });
    expect(prompt).toContain("Cornhole");
    expect(prompt).toContain("Tom — rating 1533, 3W/1L");
    expect(prompt).toContain("Tom beat Dave (singles)");
    expect(prompt).toContain("snarky but affectionate");
  });

  it("handles empty standings and results gracefully", () => {
    const prompt = buildCommentaryPrompt({
      activityName: "Badminton",
      standings: [],
      recentGames: [],
    });
    expect(prompt).toContain("(no games played yet)");
    expect(prompt).toContain("(no recent results)");
  });
});
