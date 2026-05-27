// Domain types mirroring the Supabase schema (CLAUDE.md §3).

export type Player = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type Activity = {
  id: string;
  name: string;
  supports_doubles: boolean;
  created_at: string;
};

export type Game = {
  id: string;
  activity_id: string;
  is_doubles: boolean;
  winner_ids: string[]; // length 1 (singles) or 2 (doubles)
  loser_ids: string[]; // length 1 (singles) or 2 (doubles)
  played_at: string;
  excluded: boolean;
  created_at: string;
};

// Per-activity commentary (legacy; retained in schema but no longer used by
// View 5 — superseded by the unified TournamentCommentary below).
export type Commentary = {
  activity_id: string;
  content: string;
  games_at_generation: number;
  generated_at: string;
};

// Unified tournament commentary — a single row (id always 1) covering the whole
// tournament. Auto-regenerated whenever a new game is logged (CLAUDE.md §5).
export type TournamentCommentary = {
  id: number;
  content: string;
  games_at_generation: number;
  generated_at: string;
};

// Rating output contract (CLAUDE.md §4).
export type RatingInfo = {
  rating: number; // current rating, float; round for display
  gamesPlayed: number; // count of non-excluded games this player appeared in
  lastChange: number | null; // delta from their most recent game, or null
};
