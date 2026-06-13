import { describe, it, expect } from "vitest";
import {
  computeActivityStats,
  activityWithMostGames,
  computeOverallStats,
} from "./stats";
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

function player(id: string, opts: Partial<Player> = {}): Player {
  return {
    id,
    name: opts.name ?? id,
    active: opts.active ?? true,
    created_at: opts.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("computeActivityStats", () => {
  it("returns a valid empty result for an activity with no games", () => {
    const stats = computeActivityStats([], "cornhole");
    expect(stats).toEqual({
      totalGames: 0,
      singles: 0,
      doubles: 0,
      records: [],
      headToHead: [],
    });
  });

  it("only counts games for the selected activity", () => {
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["tom"], ["dave"], { activity_id: "badminton" }),
    ];
    const stats = computeActivityStats(games, "cornhole");
    expect(stats.totalGames).toBe(1);
  });

  it("ignores excluded games", () => {
    const games = [
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"], { excluded: true }),
    ];
    const stats = computeActivityStats(games, "cornhole");
    expect(stats.totalGames).toBe(1);
    const tom = stats.records.find((r) => r.playerId === "tom")!;
    expect(tom.wins).toBe(1);
  });

  it("tallies singles W/L per player", () => {
    // Tom beats Dave 3, Dave beats Tom 1.
    const games = [
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
      game(["dave"], ["tom"]),
    ];
    const stats = computeActivityStats(games, "cornhole");
    expect(stats.singles).toBe(4);
    expect(stats.doubles).toBe(0);
    const tom = stats.records.find((r) => r.playerId === "tom")!;
    const dave = stats.records.find((r) => r.playerId === "dave")!;
    expect(tom).toMatchObject({ wins: 3, losses: 1, games: 4 });
    expect(dave).toMatchObject({ wins: 1, losses: 3, games: 4 });
    // Records sorted by wins desc -> Tom leads.
    expect(stats.records[0].playerId).toBe("tom");
  });

  it("produces a head-to-head entry ordered by leader (Tom beat Dave 3-1)", () => {
    const games = [
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
      game(["dave"], ["tom"]),
    ];
    const stats = computeActivityStats(games, "cornhole");
    expect(stats.headToHead).toHaveLength(1);
    expect(stats.headToHead[0]).toEqual({
      aId: "tom",
      bId: "dave",
      aWins: 3,
      bWins: 1,
    });
  });

  it("counts doubles toward both team members and creates 2x2 h2h pairs", () => {
    // Team [tom, ann] beats team [dave, bob].
    const games = [
      game(["tom", "ann"], ["dave", "bob"], { is_doubles: true }),
    ];
    const stats = computeActivityStats(games, "cornhole");
    expect(stats.doubles).toBe(1);
    expect(stats.singles).toBe(0);
    expect(stats.totalGames).toBe(1);

    const tom = stats.records.find((r) => r.playerId === "tom")!;
    const ann = stats.records.find((r) => r.playerId === "ann")!;
    const dave = stats.records.find((r) => r.playerId === "dave")!;
    const bob = stats.records.find((r) => r.playerId === "bob")!;
    expect(tom).toMatchObject({ wins: 1, losses: 0 });
    expect(ann).toMatchObject({ wins: 1, losses: 0 });
    expect(dave).toMatchObject({ wins: 0, losses: 1 });
    expect(bob).toMatchObject({ wins: 0, losses: 1 });

    // Each winner vs each loser => 4 opponent pairs. Teammates are NOT paired.
    expect(stats.headToHead).toHaveLength(4);
    const keys = stats.headToHead.map((h) => `${h.aId}>${h.bId}`).sort();
    expect(keys).toContain("ann>bob");
    expect(keys).toContain("ann>dave");
    expect(keys).toContain("tom>bob");
    expect(keys).toContain("tom>dave");
    // teammates tom+ann never appear as a pair
    expect(stats.headToHead.some((h) =>
      (h.aId === "tom" && h.bId === "ann") || (h.aId === "ann" && h.bId === "tom"),
    )).toBe(false);
  });
});

describe("computeOverallStats", () => {
  it("returns a valid empty result with no games or players", () => {
    const stats = computeOverallStats([], []);
    expect(stats).toEqual({
      totalGames: 0,
      singles: 0,
      doubles: 0,
      activities: 0,
      players: 0,
      rows: [],
    });
  });

  it("aggregates W/L and distinct activities across activities", () => {
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["tom"], ["dave"], { activity_id: "badminton" }),
      game(["dave"], ["tom"], { activity_id: "cornhole" }),
    ];
    const stats = computeOverallStats(games, [player("tom"), player("dave")]);

    expect(stats.totalGames).toBe(3);
    expect(stats.singles).toBe(3);
    expect(stats.doubles).toBe(0);
    expect(stats.activities).toBe(2); // cornhole + badminton
    expect(stats.players).toBe(2);

    const tom = stats.rows.find((r) => r.playerId === "tom")!;
    const dave = stats.rows.find((r) => r.playerId === "dave")!;
    expect(tom).toMatchObject({ wins: 2, losses: 1, games: 3, activities: 2 });
    expect(dave).toMatchObject({ wins: 1, losses: 2, games: 3, activities: 2 });
  });

  it("ignores excluded games", () => {
    const games = [
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"], { excluded: true, activity_id: "badminton" }),
    ];
    const stats = computeOverallStats(games, [player("tom"), player("dave")]);
    expect(stats.totalGames).toBe(1);
    expect(stats.activities).toBe(1); // badminton game was excluded
    const tom = stats.rows.find((r) => r.playerId === "tom")!;
    expect(tom).toMatchObject({ wins: 1, losses: 0, games: 1, activities: 1 });
  });

  it("rounds winPct and reports 0 for players with no games", () => {
    // tom: 2 wins / 1 loss => 66.67% -> 67. bob: no games -> 0.
    const games = [
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
      game(["dave"], ["tom"]),
    ];
    const stats = computeOverallStats(games, [
      player("tom"),
      player("dave"),
      player("bob"),
    ]);
    const tom = stats.rows.find((r) => r.playerId === "tom")!;
    const dave = stats.rows.find((r) => r.playerId === "dave")!;
    const bob = stats.rows.find((r) => r.playerId === "bob")!;
    expect(tom.winPct).toBe(67); // round(2/3*100)
    expect(dave.winPct).toBe(33); // round(1/3*100)
    expect(bob).toMatchObject({ games: 0, winPct: 0, activities: 0 });
  });

  it("sorts rows by rating desc (then games, then id)", () => {
    // tom beats dave three times => tom's global rating rises above the
    // STARTING_RATING, dave's falls below it; bob (no games) stays at start.
    const games = [
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
      game(["tom"], ["dave"]),
    ];
    const stats = computeOverallStats(games, [
      player("dave"),
      player("bob"),
      player("tom"),
    ]);
    expect(stats.rows.map((r) => r.playerId)).toEqual(["tom", "bob", "dave"]);
    expect(stats.rows[0].rating).toBeGreaterThan(stats.rows[1].rating);
    expect(stats.rows[1].rating).toBeGreaterThan(stats.rows[2].rating);
  });
});

describe("activityWithMostGames", () => {
  it("returns null when there are no games", () => {
    expect(activityWithMostGames([])).toBeNull();
  });

  it("ignores excluded games when counting", () => {
    const games = [
      game(["tom"], ["dave"], { activity_id: "a" }),
      game(["tom"], ["dave"], { activity_id: "a", excluded: true }),
      game(["tom"], ["dave"], { activity_id: "b" }),
      game(["tom"], ["dave"], { activity_id: "b" }),
    ];
    expect(activityWithMostGames(games)).toBe("b");
  });

  it("breaks ties deterministically by activity id", () => {
    const games = [
      game(["tom"], ["dave"], { activity_id: "zebra" }),
      game(["tom"], ["dave"], { activity_id: "apple" }),
    ];
    expect(activityWithMostGames(games)).toBe("apple");
  });
});
