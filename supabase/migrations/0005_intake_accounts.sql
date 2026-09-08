-- Tennis Bootcamp — intake accounts + availability standard (migration 0005)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0004 — there is no runner.
-- Safe to re-run: all statements use IF NOT EXISTS / guarded blocks.
--
-- Backlog #13: a player who fills /intake without booking an assessment gets
-- an account, the coach levels them in /admin/players, and the weekly
-- availability grid becomes the standard the cohort builder reads. This
-- migration only adds provenance to profiles.availability — every read and
-- write goes through src/lib/players.ts.

-- ─── profiles: availability provenance ───────────────────────────────────────

-- When the grid was last written (any source).
alter table public.profiles
  add column if not exists availability_updated_at timestamptz;

-- Who wrote it: the 2-minute quiz, an assessment request, the coach
-- (assessment completion or an admin correction), or the player's own
-- dashboard confirmation.
alter table public.profiles
  add column if not exists availability_source text;

-- Check constraint added separately so the column add stays idempotent.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_availability_source_check'
  ) then
    alter table public.profiles
      add constraint profiles_availability_source_check
      check (
        availability_source is null
        or availability_source in ('intake','request','assessment','dashboard')
      );
  end if;
end $$;

-- Optional one-line note from the dashboard editor ("away first two weeks of
-- October", "evenings only after Labour Day").
alter table public.profiles
  add column if not exists availability_note text;

-- ─── Backfill ─────────────────────────────────────────────────────────────────
-- Before this migration the only writer of profiles.availability was the
-- coach's admin correction, so existing grids are coach-sourced. Stamp them
-- once; rows already stamped are left alone.

update public.profiles
   set availability_source     = 'assessment',
       availability_updated_at = coalesce(level_assessed_at, now())
 where availability is not null
   and availability_source is null;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- The admin list sorts by level and by last availability update; the cohort
-- matrix filters on level. Cheap on a small table, harmless if unused.

create index if not exists profiles_level_idx
  on public.profiles (level);

create index if not exists profiles_availability_updated_at_idx
  on public.profiles (availability_updated_at);

-- ─── Notes ────────────────────────────────────────────────────────────────────
--
-- RLS is unchanged. Players already read/update their own profile row
-- (profiles_select_own / profiles_update_own from 0001); the dashboard editor
-- writes through a server route with the service-role client so the source
-- stamp can't be forged from the browser. Admins go through is_admin().
--
-- No policy grants anon anything. No new tables.
--
-- Availability JSON format is unchanged:
--   {"days":{"mon":["eve"],"wed":["mor","eve"],"sat":["aft"]},"v":1}
-- Band hours (the displayed standard) live in src/lib/availability.ts:
--   Morning 8:00–12:00 · Afternoon 12:00–16:00 · Evening 16:00–20:00.
