-- LFG Olympics schema (CLAUDE.md §3). Run in Supabase SQL editor.

-- Players
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Activities (e.g. "Cornhole", "Badminton")
create table activities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  supports_doubles boolean not null default true,
  created_at timestamptz not null default now()
);

-- Games (the event log — THE source of truth for ratings)
create table games (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id),
  is_doubles boolean not null default false,
  winner_ids uuid[] not null,  -- length 1 (singles) or 2 (doubles)
  loser_ids uuid[] not null,   -- length 1 (singles) or 2 (doubles)
  played_at timestamptz not null default now(),
  excluded boolean not null default false,
  created_at timestamptz not null default now()
);
create index games_played_at_idx on games (played_at, created_at);

-- LLM commentary cache (one row per activity, regenerated on demand)
create table commentary (
  activity_id uuid primary key references activities(id),
  content text not null,
  games_at_generation int not null,
  generated_at timestamptz not null default now()
);
