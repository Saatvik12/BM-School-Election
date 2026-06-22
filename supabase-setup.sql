-- ============================================
-- ELECTION SYSTEM — SUPABASE SQL SETUP
-- Run this entire script in Supabase SQL Editor
-- ============================================

-- 1. CANDIDATES TABLE
create table if not exists candidates (
  id serial primary key,
  position text not null check (position in ('SPL', 'ASPL')),
  name text not null,
  display_order integer not null default 0,
  active boolean not null default true
);

-- 2. VOTES TABLE
create table if not exists votes (
  id serial primary key,
  booth integer not null check (booth between 1 and 6),
  spl text not null,
  aspl text not null,
  created_at timestamptz not null default now()
);

-- 3. ELECTION SETTINGS TABLE
create table if not exists election_settings (
  id serial primary key,
  voting_open boolean not null default false
);

-- 4. BOOTH STATUS TABLE
create table if not exists booth_status (
  booth integer primary key check (booth between 1 and 6),
  last_seen timestamptz not null default now()
);

-- ============================================
-- SEED DATA
-- ============================================

-- Insert election settings row (only one row ever)
insert into election_settings (id, voting_open)
values (1, false)
on conflict (id) do nothing;

-- *** EDIT THESE NAMES BEFORE ELECTION DAY ***
insert into candidates (position, name, display_order, active) values
  ('SPL', 'Candidate A', 1, true),
  ('SPL', 'Candidate B', 2, true),
  ('SPL', 'Candidate C', 3, true),
  ('ASPL', 'Candidate X', 1, true),
  ('ASPL', 'Candidate Y', 2, true),
  ('ASPL', 'Candidate Z', 3, true)
on conflict do nothing;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
alter table candidates enable row level security;
alter table votes enable row level security;
alter table election_settings enable row level security;
alter table booth_status enable row level security;

-- CANDIDATES: anyone can read active candidates
create policy "Read active candidates"
  on candidates for select
  using (active = true);

-- VOTES: anyone can insert; anyone can read
create policy "Insert votes"
  on votes for insert
  with check (true);

create policy "Read votes"
  on votes for select
  using (true);

-- ELECTION SETTINGS: anyone can read; anyone can update (admin auth is app-level)
create policy "Read election settings"
  on election_settings for select
  using (true);

create policy "Update election settings"
  on election_settings for update
  using (true);

-- BOOTH STATUS: anyone can read and upsert
create policy "Read booth status"
  on booth_status for select
  using (true);

create policy "Upsert booth status"
  on booth_status for insert
  with check (true);

create policy "Update booth status"
  on booth_status for update
  using (true);

-- ============================================
-- REALTIME
-- Enable realtime on these tables in:
-- Supabase Dashboard → Database → Replication
-- Toggle ON: votes, booth_status, election_settings
-- ============================================
