-- RLS policies (CLAUDE.md §3). No-auth equivalent: allow anon select/insert/update
-- on all four tables. Run AFTER schema.sql.

-- Enable RLS on all tables.
alter table players    enable row level security;
alter table activities enable row level security;
alter table games      enable row level security;
alter table commentary enable row level security;

-- players
create policy "anon select players" on players for select to anon using (true);
create policy "anon insert players" on players for insert to anon with check (true);
create policy "anon update players" on players for update to anon using (true) with check (true);

-- activities
create policy "anon select activities" on activities for select to anon using (true);
create policy "anon insert activities" on activities for insert to anon with check (true);
create policy "anon update activities" on activities for update to anon using (true) with check (true);

-- games
create policy "anon select games" on games for select to anon using (true);
create policy "anon insert games" on games for insert to anon with check (true);
create policy "anon update games" on games for update to anon using (true) with check (true);

-- commentary
create policy "anon select commentary" on commentary for select to anon using (true);
create policy "anon insert commentary" on commentary for insert to anon with check (true);
create policy "anon update commentary" on commentary for update to anon using (true) with check (true);
