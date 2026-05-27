// POST /api/commentary — generate & cache the UNIFIED tournament commentary.
//
// SERVER-ONLY route handler (CLAUDE.md §5 View 5). The Anthropic SDK and
// ANTHROPIC_API_KEY are used here only; the key is NOT prefixed NEXT_PUBLIC_ and
// never reaches the browser. Supabase is accessed with the anon key (RLS allows
// anon select/upsert) — no service-role key, no new secrets.
//
// Standings are computed via the shared elo engine (computeRatings) — ratings
// are never stored (§2). We only persist the generated text + the count of
// non-excluded games (across ALL activities) at generation time, used for the
// staleness check.
//
// This is the primary regeneration path: the Record Result flow (View 2) fires
// a background POST here after every successful game insert.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { computeRatings } from "@/lib/elo";
import {
  buildCommentaryPrompt,
  overallStandings,
  recentGamesForPrompt,
  totalNonExcludedGameCount,
} from "@/lib/commentary";
import type { Activity, Adjustment, Game, Player } from "@/lib/types";

// Always run dynamically on the server (never prerendered/cached).
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const API_TIMEOUT_MS = 15_000;
const TOURNAMENT_COMMENTARY_ID = 1;

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

export async function POST() {
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

  // 1. Fetch ALL games, adjustments, activities (for names), and players.
  const [gamesRes, adjustmentsRes, activitiesRes, playersRes] =
    await Promise.all([
      supabase.from("games").select("*"),
      supabase.from("adjustments").select("*"),
      supabase.from("activities").select("*"),
      supabase.from("players").select("*"),
    ]);

  if (
    gamesRes.error ||
    adjustmentsRes.error ||
    activitiesRes.error ||
    playersRes.error
  ) {
    return Response.json(
      { error: "Failed to load games, activities, or players." },
      { status: 500 },
    );
  }

  const games = (gamesRes.data ?? []) as Game[];
  const adjustments = (adjustmentsRes.data ?? []) as Adjustment[];
  const activities = (activitiesRes.data ?? []) as Activity[];
  const players = (playersRes.data ?? []) as Player[];

  const count = totalNonExcludedGameCount(games);

  // 2. Build the unified prompt. Standings use the global elo ratings (computed,
  //    never stored) and include manual adjustments as event-sourced inputs.
  //    Recent games span all activities, newest first.
  const ratings = computeRatings(games, players, adjustments);
  const standings = overallStandings(games, players, ratings);
  const activityNameById = new Map(activities.map((a) => [a.id, a.name]));
  const recentGames = recentGamesForPrompt(games, players, activityNameById, 10);
  const prompt = buildCommentaryPrompt({ standings, recentGames });

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

  // 4. Upsert the single tournament_commentary row (id = 1) with the current
  //    total non-excluded game count.
  const { error: upsertError } = await supabase
    .from("tournament_commentary")
    .upsert(
      {
        id: TOURNAMENT_COMMENTARY_ID,
        content,
        games_at_generation: count,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
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
