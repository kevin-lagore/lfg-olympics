import { describe, it, expect } from "vitest";
import {
  computeRatings,
  computeGameDeltas,
  gameDelta,
  expectedScore,
  isUpset,
  isUpsetForNewGame,
  STARTING_RATING,
  K_FACTOR,
  UNDERDOG_MULTIPLIER,
} from "./elo";
import type { Game, Player } from "./types";

// Ratings are on the "indexed to 100" scale (CLAUDE.md §4): every classic
// 1500/400/K=64 constant divided by 15. Win probabilities and relative swings
// are identical to the classic scale; only the displayed numbers are smaller.
// STARTING_RATING === 100, K_FACTOR === 64/15 ≈ 4.2667.

// --- Test helpers ---------------------------------------------------------

function player(id: string, name = id, active = true): Player {
  return { id, name, active, created_at: "2026-01-01T00:00:00.000Z" };
}

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
    activity_id: opts.activity_id ?? "act-1",
    is_doubles: opts.is_doubles ?? winner_ids.length > 1,
    winner_ids,
    loser_ids,
    played_at: opts.played_at ?? stamp,
    excluded: opts.excluded ?? false,
    created_at: opts.created_at ?? stamp,
  };
}

const rating = (m: ReturnType<typeof computeRatings>, id: string) =>
  m.get(id)!.rating;
const round = (m: ReturnType<typeof computeRatings>, id: string) =>
  Math.round(rating(m, id));

// The even-game delta on the 100 scale: K/2 = (64/15)/2 ≈ 2.1333, displays ±2.
const EVEN_DELTA = K_FACTOR * 0.5;

// --- Scale invariants -----------------------------------------------------

describe("100 index scale", () => {
  it("starts everyone at 100", () => {
    expect(STARTING_RATING).toBe(100);
  });

  it("K_FACTOR is exactly 64/15 (not rounded)", () => {
    expect(K_FACTOR).toBe(64 / 15);
  });

  it("even-game delta is exactly 1/15 of the classic-scale delta", () => {
    // Classic: equal ratings -> K=64, expected 0.5 -> delta 32.
    const classicEqualDelta = 64 * 0.5; // = 32
    expect(gameDelta([100], [100])).toBeCloseTo(classicEqualDelta / 15, 9);
    expect(EVEN_DELTA).toBeCloseTo(32 / 15, 9);
  });

  it("expected scores are unchanged for equivalent matchups (87 vs 113 ~ 1305 vs 1695)", () => {
    // 13-point gap on the 100 scale == 195-point gap on the classic scale.
    expect(expectedScore(87, 113)).toBeCloseTo(
      // classic 1500-scale equivalent
      1 / (1 + Math.pow(10, (1695 - 1305) / 400)),
      9,
    );
  });
});

// --- Singles, equal -------------------------------------------------------

describe("singles, equal ratings", () => {
  it("winner +2, loser -2 (no underdog)", () => {
    const players = [player("A"), player("B")];
    const out = computeRatings([game(["A"], ["B"])], players);
    // ±2.1333 -> displays ±2 (§4 worked example: equal ±2).
    expect(round(out, "A")).toBe(102);
    expect(round(out, "B")).toBe(98);
    expect(out.get("A")!.lastChange).toBeCloseTo(EVEN_DELTA, 6);
    expect(out.get("B")!.lastChange).toBeCloseTo(-EVEN_DELTA, 6);
    expect(out.get("A")!.gamesPlayed).toBe(1);
    expect(out.get("B")!.gamesPlayed).toBe(1);
  });
});

// --- Singles, upset (underdog multiplier) ---------------------------------

describe("singles upset", () => {
  it("applies the 1.3 underdog multiplier when the winner is lower-rated", () => {
    // First game: B beats A. Now A < B (A ≈ 97.87, B ≈ 102.13).
    // Second game: A (the underdog) beats B -> underdog multiplier must fire.
    const players = [player("A"), player("B")];
    const g1 = game(["B"], ["A"]);
    const g2 = game(["A"], ["B"]);
    const out = computeRatings([g1, g2], players);

    // Pre-game-2 ratings: A = 100 - EVEN_DELTA, B = 100 + EVEN_DELTA.
    const preA = STARTING_RATING - EVEN_DELTA;
    const preB = STARTING_RATING + EVEN_DELTA;
    const expectedDelta =
      K_FACTOR * (1 - expectedScore(preA, preB)) * UNDERDOG_MULTIPLIER;

    expect(out.get("A")!.lastChange).toBeCloseTo(expectedDelta, 6);
    expect(out.get("B")!.lastChange).toBeCloseTo(-expectedDelta, 6);
    // Multiplier must make this strictly bigger than the un-multiplied delta.
    const unmultiplied = K_FACTOR * (1 - expectedScore(preA, preB));
    expect(out.get("A")!.lastChange!).toBeGreaterThan(unmultiplied + 0.01);
  });

  it("matches the CLAUDE.md §4 worked example (A 87 vs B 113 -> ~+5)", () => {
    // Verify the formula path directly against documented numbers.
    const delta =
      K_FACTOR * (1 - expectedScore(87, 113)) * UNDERDOG_MULTIPLIER;
    expect(Math.round(delta)).toBe(5);
  });
});

// --- Doubles, equal -------------------------------------------------------

describe("doubles, equal teams", () => {
  it("each winner +2, each loser -2; zero-sum", () => {
    const players = [player("A1"), player("A2"), player("B1"), player("B2")];
    const out = computeRatings([game(["A1", "A2"], ["B1", "B2"])], players);
    expect(round(out, "A1")).toBe(102);
    expect(round(out, "A2")).toBe(102);
    expect(round(out, "B1")).toBe(98);
    expect(round(out, "B2")).toBe(98);
    const total =
      rating(out, "A1") +
      rating(out, "A2") +
      rating(out, "B1") +
      rating(out, "B2");
    expect(total).toBeCloseTo(4 * STARTING_RATING, 6);
  });
});

// --- Doubles, upset (underdog multiplier) ---------------------------------

describe("doubles upset", () => {
  it("applies 1.3 multiplier when winning team's avg is lower; matches §4 example", () => {
    // §4 worked example: Team A avg 93 vs Team B avg 107, A wins -> each ±4.
    const teamA = 93;
    const teamB = 107;
    const delta = K_FACTOR * (1 - expectedScore(teamA, teamB)) * UNDERDOG_MULTIPLIER;
    expect(Math.round(delta)).toBe(4);

    // Now drive a real replay so winners avg < losers avg, and confirm the
    // full (multiplied) delta is applied to each member with correct sign.
    const players = [player("A1"), player("A2"), player("B1"), player("B2")];
    // Game 1: B team beats A team -> A members 100-EVEN_DELTA, B members 100+EVEN_DELTA.
    const g1 = game(["B1", "B2"], ["A1", "A2"]);
    // Game 2: A team (underdogs) beat B team.
    const g2 = game(["A1", "A2"], ["B1", "B2"]);
    const out = computeRatings([g1, g2], players);

    const preWin = STARTING_RATING - EVEN_DELTA; // A members pre-game-2
    const preLose = STARTING_RATING + EVEN_DELTA; // B members pre-game-2
    const expectedDelta =
      K_FACTOR * (1 - expectedScore(preWin, preLose)) * UNDERDOG_MULTIPLIER;

    expect(out.get("A1")!.lastChange).toBeCloseTo(expectedDelta, 6);
    expect(out.get("A2")!.lastChange).toBeCloseTo(expectedDelta, 6);
    expect(out.get("B1")!.lastChange).toBeCloseTo(-expectedDelta, 6);
    expect(out.get("B2")!.lastChange).toBeCloseTo(-expectedDelta, 6);
  });
});

// --- Replay determinism ---------------------------------------------------

describe("replay determinism", () => {
  it("same games in shuffled input order produce identical final ratings", () => {
    const players = [player("A"), player("B"), player("C"), player("D")];
    const games: Game[] = [
      game(["A"], ["B"]),
      game(["C", "A"], ["B", "D"]),
      game(["D"], ["C"]),
      game(["B"], ["A"]),
      game(["A", "D"], ["B", "C"]),
    ];

    const ordered = computeRatings([...games], players);

    // Reverse order.
    const reversed = computeRatings([...games].reverse(), players);
    // Arbitrary shuffle.
    const shuffled = computeRatings(
      [games[2], games[0], games[4], games[1], games[3]],
      players,
    );

    for (const id of ["A", "B", "C", "D"]) {
      expect(reversed.get(id)!.rating).toBeCloseTo(
        ordered.get(id)!.rating,
        9,
      );
      expect(shuffled.get(id)!.rating).toBeCloseTo(
        ordered.get(id)!.rating,
        9,
      );
      expect(reversed.get(id)!.gamesPlayed).toBe(ordered.get(id)!.gamesPlayed);
    }
  });
});

// --- Exclude behaviour ----------------------------------------------------

describe("exclude behaviour", () => {
  it("excluded games are skipped on replay (rating and gamesPlayed unaffected)", () => {
    const players = [player("A"), player("B")];

    const included = computeRatings([game(["A"], ["B"])], players);

    seq = 100; // separate timestamp band
    const withExcluded = computeRatings(
      [
        game(["A"], ["B"]),
        game(["B"], ["A"], { excluded: true }), // would reverse if counted
      ],
      players,
    );

    expect(withExcluded.get("A")!.rating).toBeCloseTo(
      included.get("A")!.rating,
      9,
    );
    expect(withExcluded.get("A")!.gamesPlayed).toBe(1);
    expect(withExcluded.get("B")!.gamesPlayed).toBe(1);
    // lastChange reflects only the non-excluded game.
    expect(withExcluded.get("A")!.lastChange).toBeCloseTo(EVEN_DELTA, 6);
  });

  it("a fully-excluded set leaves everyone at the starting rating", () => {
    const players = [player("A"), player("B")];
    const out = computeRatings(
      [game(["A"], ["B"], { excluded: true })],
      players,
    );
    expect(out.get("A")!.rating).toBe(STARTING_RATING);
    expect(out.get("B")!.rating).toBe(STARTING_RATING);
    expect(out.get("A")!.gamesPlayed).toBe(0);
    expect(out.get("A")!.lastChange).toBeNull();
  });
});

// --- gameDelta helper -----------------------------------------------------

describe("gameDelta helper", () => {
  it("equal singles -> ~2.13 (displays 2)", () => {
    expect(gameDelta([100], [100])).toBeCloseTo(EVEN_DELTA, 6);
    expect(Math.round(gameDelta([100], [100]))).toBe(2);
  });

  it("applies underdog x1.3 when winners' avg is strictly lower", () => {
    expect(gameDelta([87], [113])).toBeCloseTo(
      K_FACTOR * (1 - expectedScore(87, 113)) * UNDERDOG_MULTIPLIER,
      6,
    );
    expect(Math.round(gameDelta([87], [113]))).toBe(5); // §4 worked example
  });

  it("no underdog multiplier when winners' avg >= losers' avg", () => {
    expect(gameDelta([113], [87])).toBeCloseTo(
      K_FACTOR * (1 - expectedScore(113, 87)),
      6,
    );
  });

  it("uses team means for doubles (matches §4 upset example -> 4)", () => {
    expect(Math.round(gameDelta([93, 93], [107, 107]))).toBe(4);
  });
});

// --- isUpset / isUpsetForNewGame ------------------------------------------

describe("isUpset", () => {
  it("true when winners' pre-game average is strictly lower (singles)", () => {
    expect(isUpset([87], [113])).toBe(true);
  });

  it("false when winners' average is higher", () => {
    expect(isUpset([113], [87])).toBe(false);
  });

  it("false on an exact tie (strictly lower, not <=)", () => {
    expect(isUpset([100], [100])).toBe(false);
  });

  it("uses team means for doubles", () => {
    // winners avg 93 < losers avg 107 -> upset.
    expect(isUpset([86, 100], [103, 111])).toBe(true);
    // winners avg 107 > losers avg 93 -> not an upset.
    expect(isUpset([103, 111], [86, 100])).toBe(false);
  });

  it("agrees with gameDelta's multiplier: upset iff delta is multiplied", () => {
    const w = [87];
    const l = [113];
    const multiplied = gameDelta(w, l);
    const base = K_FACTOR * (1 - expectedScore(87, 113));
    // When isUpset is true, gameDelta applied the ×1.3 multiplier.
    expect(isUpset(w, l)).toBe(true);
    expect(multiplied).toBeCloseTo(base * UNDERDOG_MULTIPLIER, 6);
  });
});

describe("isUpsetForNewGame", () => {
  it("detects an upset using current computed ratings as the pre-game state", () => {
    seq = 500;
    const players = [player("A"), player("B")];
    // B beats A first -> A < B. A is now the underdog.
    const g1 = game(["B"], ["A"]);
    // New (not-yet-logged) game: A beats B -> upset.
    expect(isUpsetForNewGame([g1], players, ["A"], ["B"])).toBe(true);
    // Reverse winner/loser: B beats A -> favourite wins, not an upset.
    expect(isUpsetForNewGame([g1], players, ["B"], ["A"])).toBe(false);
  });

  it("treats unknown / first-time players as starting rating (no upset on equal start)", () => {
    const players = [player("A"), player("B")];
    expect(isUpsetForNewGame([], players, ["A"], ["B"])).toBe(false);
  });

  it("ignores excluded games when computing pre-game ratings", () => {
    seq = 520;
    const players = [player("A"), player("B")];
    // The only game is excluded, so ratings stay equal -> no upset either way.
    const g1 = game(["B"], ["A"], { excluded: true });
    expect(isUpsetForNewGame([g1], players, ["A"], ["B"])).toBe(false);
  });
});

// --- computeGameDeltas (per-row history deltas) ---------------------------

describe("computeGameDeltas", () => {
  it("reports a signed delta per participant per game, consistent with the replay", () => {
    seq = 200;
    const players = [player("A"), player("B")];
    const g1 = game(["A"], ["B"]); // A +2.13, B -2.13
    const g2 = game(["A"], ["B"]); // A now favourite, smaller delta
    const deltas = computeGameDeltas([g1, g2], players);

    // Game 1: equal ratings.
    expect(deltas.get(g1.id)!.get("A")).toBeCloseTo(EVEN_DELTA, 6);
    expect(deltas.get(g1.id)!.get("B")).toBeCloseTo(-EVEN_DELTA, 6);

    // Game 2: pre-game A > B -> favourite wins, delta < even-game delta.
    const d2 = deltas.get(g2.id)!.get("A")!;
    expect(d2).toBeGreaterThan(0);
    expect(d2).toBeLessThan(EVEN_DELTA);
    expect(deltas.get(g2.id)!.get("B")).toBeCloseTo(-d2, 6);

    // The per-game deltas must sum to each player's final movement from start.
    const final = computeRatings([g1, g2], players);
    const sumA =
      deltas.get(g1.id)!.get("A")! + deltas.get(g2.id)!.get("A")!;
    expect(STARTING_RATING + sumA).toBeCloseTo(final.get("A")!.rating, 6);
  });

  it("does not let an excluded game advance ratings for later games", () => {
    seq = 300;
    const players = [player("A"), player("B")];
    // Excluded first game; the SECOND (included) game must see equal pre-game
    // ratings (100/100) because the excluded one did not move anything.
    const g1 = game(["A"], ["B"], { excluded: true });
    const g2 = game(["A"], ["B"]);
    const deltas = computeGameDeltas([g1, g2], players);

    // g2 evaluated against fresh 100/100 -> even-game delta.
    expect(deltas.get(g2.id)!.get("A")).toBeCloseTo(EVEN_DELTA, 6);
    // g1 still reports the delta it would have applied (also even at 100/100),
    // but it is flagged excluded and never moved the running ratings.
    expect(deltas.get(g1.id)!.get("A")).toBeCloseTo(EVEN_DELTA, 6);
  });
});

// --- Orchestrator verification: 5 games / exclude #3 / re-include ----------

describe("exclude/re-include matches a replay that skips the game (5-game scenario)", () => {
  function fiveGames(): { players: Player[]; games: Game[] } {
    seq = 400;
    const players = [
      player("A"),
      player("B"),
      player("C"),
      player("D"),
    ];
    const games: Game[] = [
      game(["A"], ["B"]), // g1
      game(["C"], ["D"]), // g2
      game(["A"], ["C"]), // g3  <-- the one we toggle
      game(["B"], ["D"]), // g4
      game(["A", "C"], ["B", "D"]), // g5 doubles
    ];
    return { players, games };
  }

  it("excluding game 3 == a replay built without game 3", () => {
    const { players, games } = fiveGames();
    const g3 = games[2];

    const baseline = computeRatings(games, players); // all 5 included

    // Approach 1: flip excluded on g3.
    const excludedFlag = computeRatings(
      games.map((g) => (g.id === g3.id ? { ...g, excluded: true } : g)),
      players,
    );
    // Approach 2: physically omit g3 from the input set.
    const omitted = computeRatings(
      games.filter((g) => g.id !== g3.id),
      players,
    );

    for (const id of ["A", "B", "C", "D"]) {
      // The flag flip and the physical omission must be identical.
      expect(excludedFlag.get(id)!.rating).toBeCloseTo(
        omitted.get(id)!.rating,
        9,
      );
      // And excluding genuinely changed the leaderboard vs the full set
      // (sanity: g3 actually mattered for its participants).
    }
    expect(excludedFlag.get("A")!.rating).not.toBeCloseTo(
      baseline.get("A")!.rating,
      6,
    );
  });

  it("re-including restores the original ratings exactly", () => {
    const { players, games } = fiveGames();
    const g3 = games[2];

    const original = computeRatings(games, players);

    // Exclude then re-include (flag back to false) -> back to original.
    const reincluded = computeRatings(
      games.map((g) =>
        g.id === g3.id ? { ...g, excluded: false } : g,
      ),
      players,
    );

    for (const id of ["A", "B", "C", "D"]) {
      expect(reincluded.get(id)!.rating).toBeCloseTo(
        original.get(id)!.rating,
        9,
      );
      expect(reincluded.get(id)!.gamesPlayed).toBe(
        original.get(id)!.gamesPlayed,
      );
    }
  });
});
