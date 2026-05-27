import { describe, it, expect, vi } from "vitest";
import {
  isCommentaryStale,
  totalNonExcludedGameCount,
  overallStandings,
  recentGamesForPrompt,
  buildCommentaryPrompt,
  runCommentaryRegeneration,
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

describe("totalNonExcludedGameCount", () => {
  it("counts non-excluded games across ALL activities", () => {
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["tom"], ["dave"], { activity_id: "cornhole", excluded: true }),
      game(["tom"], ["dave"], { activity_id: "badminton" }),
    ];
    expect(totalNonExcludedGameCount(games)).toBe(2);
  });

  it("is zero with no games", () => {
    expect(totalNonExcludedGameCount([])).toBe(0);
  });
});

describe("isCommentaryStale", () => {
  it("is not stale when there is no commentary (empty state, not stale)", () => {
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

  it("matches the count produced by totalNonExcludedGameCount (integration)", () => {
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["ann"], ["bob"], { activity_id: "badminton" }),
    ];
    // Commentary generated when only 1 game existed -> now 2 (across all
    // activities) -> stale.
    expect(
      isCommentaryStale(
        { games_at_generation: 1 },
        totalNonExcludedGameCount(games),
      ),
    ).toBe(true);
  });

  it("becomes stale after an exclude toggle reduces then a new game raises the count", () => {
    // Generated at 3 games; one excluded -> 2; then a new game -> 3 again.
    // games_at_generation (3) is NOT < 3 -> fresh. But if a further game lands
    // -> 4 -> stale. Confirms the boundary.
    expect(isCommentaryStale({ games_at_generation: 3 }, 3)).toBe(false);
    expect(isCommentaryStale({ games_at_generation: 3 }, 4)).toBe(true);
  });
});

describe("overallStandings", () => {
  it("includes every player across all activities, with global rating and total W/L, sorted by rating", () => {
    const players = [player("tom"), player("dave"), player("ann")];
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["tom"], ["dave"], { activity_id: "cornhole" }),
      game(["ann"], ["dave"], { activity_id: "badminton" }),
    ];
    const ratings = computeRatings(games, players);
    const standings = overallStandings(games, players, ratings);
    // all three appear (unlike per-activity)
    expect(standings.map((s) => s.name).sort()).toEqual(["ann", "dave", "tom"]);
    const tom = standings.find((s) => s.name === "tom")!;
    const dave = standings.find((s) => s.name === "dave")!;
    const ann = standings.find((s) => s.name === "ann")!;
    expect(tom).toMatchObject({ wins: 2, losses: 0 });
    expect(dave).toMatchObject({ wins: 0, losses: 3 });
    expect(ann).toMatchObject({ wins: 1, losses: 0 });
    // tom is top of the standings (most wins, highest rating)
    expect(standings[0].name).toBe("tom");
  });

  it("excludes excluded games from W/L and from the player set", () => {
    const players = [player("tom"), player("dave")];
    const games = [
      game(["tom"], ["dave"], { activity_id: "cornhole", excluded: true }),
    ];
    const ratings = computeRatings(games, players);
    expect(overallStandings(games, players, ratings)).toEqual([]);
  });
});

describe("recentGamesForPrompt", () => {
  it("returns last N non-excluded games across all activities, newest first, tagged with activity", () => {
    const players = [
      player("tom", "Tom"),
      player("dave", "Dave"),
      player("ann", "Ann"),
    ];
    const activityNames = new Map([
      ["cornhole", "Cornhole"],
      ["badminton", "Badminton"],
    ]);
    const games = [
      game(["tom"], ["dave"], {
        id: "old",
        activity_id: "cornhole",
        played_at: "2026-01-01T00:00:01.000Z",
        created_at: "2026-01-01T00:00:01.000Z",
      }),
      game(["ann"], ["tom"], {
        id: "new",
        activity_id: "badminton",
        played_at: "2026-01-01T00:00:09.000Z",
        created_at: "2026-01-01T00:00:09.000Z",
      }),
      game(["tom"], ["dave"], { id: "excl", excluded: true }),
    ];
    const recent = recentGamesForPrompt(games, players, activityNames, 10);
    expect(recent).toHaveLength(2);
    // newest first -> "new" (Ann beat Tom in Badminton) leads
    expect(recent[0]).toEqual({
      activity: "Badminton",
      winners: ["Ann"],
      losers: ["Tom"],
      isDoubles: false,
    });
    expect(recent[1].activity).toBe("Cornhole");
  });

  it("respects the limit", () => {
    const players = [player("tom"), player("dave")];
    const activityNames = new Map([["cornhole", "Cornhole"]]);
    const games = Array.from({ length: 15 }, () => game(["tom"], ["dave"]));
    expect(recentGamesForPrompt(games, players, activityNames, 10)).toHaveLength(
      10,
    );
  });
});

describe("buildCommentaryPrompt", () => {
  it("includes the tournament framing, standings, and recent results with activities", () => {
    const prompt = buildCommentaryPrompt({
      standings: [{ name: "Tom", rating: 1532.6, wins: 3, losses: 1 }],
      recentGames: [
        {
          activity: "Cornhole",
          winners: ["Tom"],
          losers: ["Dave"],
          isDoubles: false,
        },
      ],
    });
    expect(prompt).toContain("LFG Olympics");
    expect(prompt).toContain("Tom — rating 1533, 3W/1L");
    expect(prompt).toContain("[Cornhole] Tom beat Dave (singles)");
    expect(prompt).toContain("snarky but affectionate");
    expect(prompt).toContain("tournament as a whole");
  });

  it("handles empty standings and results gracefully", () => {
    const prompt = buildCommentaryPrompt({
      standings: [],
      recentGames: [],
    });
    expect(prompt).toContain("(no games played yet)");
    expect(prompt).toContain("(no recent results)");
  });
});

describe("runCommentaryRegeneration", () => {
  function harness() {
    let flag = false;
    const calls: string[] = [];
    return {
      calls,
      isInFlight: () => flag,
      setInFlight: (v: boolean) => {
        flag = v;
      },
      setRegenerating: vi.fn((v: boolean) =>
        calls.push(v ? "regenerating:on" : "regenerating:off"),
      ),
    };
  }

  it("posts, then refetches on success, then clears the flag (in that order)", async () => {
    const h = harness();
    const post = vi.fn(async () => {
      h.calls.push("post");
    });
    const refresh = vi.fn(async () => {
      h.calls.push("refresh");
    });

    await runCommentaryRegeneration({
      isInFlight: h.isInFlight,
      setInFlight: h.setInFlight,
      setRegenerating: h.setRegenerating,
      post,
      refresh,
    });

    expect(post).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    // Flag on before post, refetch after post, flag off only after refresh.
    expect(h.calls).toEqual([
      "regenerating:on",
      "post",
      "refresh",
      "regenerating:off",
    ]);
    expect(h.isInFlight()).toBe(false);
  });

  it("still refetches and clears the flag when the POST fails (e.g. 503 / network)", async () => {
    const h = harness();
    const post = vi.fn(async () => {
      throw new Error("503");
    });
    const refresh = vi.fn(async () => {});
    const onError = vi.fn();

    await runCommentaryRegeneration({
      isInFlight: h.isInFlight,
      setInFlight: h.setInFlight,
      setRegenerating: h.setRegenerating,
      post,
      refresh,
      onError,
    });

    // The refetch-on-completion wiring runs regardless of the POST outcome —
    // this is what makes the Commentary view converge whether the LLM call
    // returns real text or hits the no-API-key error path.
    expect(refresh).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(h.setRegenerating).toHaveBeenLastCalledWith(false);
    expect(h.isInFlight()).toBe(false);
  });

  it("coalesces: a call while one is in flight is a no-op", async () => {
    const h = harness();
    // Simulate an in-flight regeneration.
    h.setInFlight(true);
    const post = vi.fn(async () => {});
    const refresh = vi.fn(async () => {});

    await runCommentaryRegeneration({
      isInFlight: h.isInFlight,
      setInFlight: h.setInFlight,
      setRegenerating: h.setRegenerating,
      post,
      refresh,
    });

    expect(post).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(h.setRegenerating).not.toHaveBeenCalled();
  });

  it("clears the flag even if the refetch itself throws", async () => {
    const h = harness();
    const post = vi.fn(async () => {});
    const refresh = vi.fn(async () => {
      throw new Error("refetch failed");
    });
    const onError = vi.fn();

    await runCommentaryRegeneration({
      isInFlight: h.isInFlight,
      setInFlight: h.setInFlight,
      setRegenerating: h.setRegenerating,
      post,
      refresh,
      onError,
    });

    expect(h.setRegenerating).toHaveBeenLastCalledWith(false);
    expect(h.isInFlight()).toBe(false);
  });
});
