// POST /api/commentary/[activityId] — generate & cache LLM commentary.
//
// SERVER-ONLY route handler (CLAUDE.md §5 View 5). The Anthropic SDK and
// ANTHROPIC_API_KEY are used here only; the key is NOT prefixed NEXT_PUBLIC_ and
// never reaches the browser. Supabase is accessed with the anon key (RLS allows
// anon select/upsert) — no service-role key, no new secrets.
//
// Standings are computed via the shared elo engine (computeRatings) — ratings
// are never stored (§2). We only persist the generated text + the count of
// non-excluded games at generation time, used for the staleness check.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { computeRatings } from "@/lib/elo";
import {
  activityStandings,
  buildCommentaryPrompt,
  nonExcludedGameCount,
  recentGamesForPrompt,
} from "@/lib/commentary";
import type { Activity, Game, Player } from "@/lib/types";

// Always run dynamically on the server (never prerendered/cached).
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const API_TIMEOUT_MS = 15_000;

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase env vars");
  }
  // No realtime/session persistence needed for a one-shot server request.
  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/commentary/[activityId]">,
) {
  const { activityId } = await ctx.params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Commentary is not configured (missing API key)." },
      { status: 503 },
    );
  }

  let supabase;
  try {
    supabase = supabaseServer();
  } catch {
    return Response.json(
      { error: "Server is not configured for database access." },
      { status: 500 },
    );
  }

  // 1. Fetch the activity, its games, and all players (for standings + names).
  const [activityRes, gamesRes, playersRes] = await Promise.all([
    supabase.from("activities").select("*").eq("id", activityId).single(),
    supabase.from("games").select("*").eq("activity_id", activityId),
    supabase.from("players").select("*"),
  ]);

  if (activityRes.error || !activityRes.data) {
    return Response.json({ error: "Activity not found." }, { status: 404 });
  }
  if (gamesRes.error || playersRes.error) {
    return Response.json(
      { error: "Failed to load games or players." },
      { status: 500 },
    );
  }

  const activity = activityRes.data as Activity;
  const games = (gamesRes.data ?? []) as Game[];
  const players = (playersRes.data ?? []) as Player[];

  const count = nonExcludedGameCount(games, activityId);

  // 2. Build the prompt. Standings use the global elo ratings (computed, never
  //    stored) restricted to players who appear in this activity's games.
  const ratings = computeRatings(games, players);
  const standings = activityStandings(games, players, ratings, activityId);
  const recentGames = recentGamesForPrompt(games, players, activityId, 10);
  const prompt = buildCommentaryPrompt({
    activityName: activity.name,
    standings,
    recentGames,
  });

  // 3. Call Claude Sonnet with a hard 15s timeout.
  const anthropic = new Anthropic({ apiKey });
  let content: string;
  try {
    const message = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: API_TIMEOUT_MS },
    );
    content = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!content) {
      throw new Error("Empty response from model");
    }
  } catch {
    return Response.json(
      { error: "Failed to generate commentary. Please try again." },
      { status: 502 },
    );
  }

  // 4. Upsert the commentary with the current non-excluded game count.
  const { error: upsertError } = await supabase.from("commentary").upsert(
    {
      activity_id: activityId,
      content,
      games_at_generation: count,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "activity_id" },
  );

  if (upsertError) {
    return Response.json(
      { error: "Generated commentary but failed to save it." },
      { status: 500 },
    );
  }

  // 5. Return the new content.
  return Response.json({ content });
}
