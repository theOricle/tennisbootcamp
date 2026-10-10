-- Tennis Bootcamp — each player's age band and self-estimate (migration 0009)
-- Audit 2026-10-09, findings M31 and L20: the quiz and the booking form ask
-- every player's age band and where their game is right now, but
-- `participants` (0007) had nowhere to keep either answer. A returning
-- parent's 15-year-old was pre-set to Junior, the dashboard's "Suggested for
-- you" could only tell minors from adults, and the admin player pool showed no
-- age or self-estimate at all.
--
-- From PR I on, src/lib/players.ts writes both columns whenever a flow names a
-- player (the quiz, the booking form, request-a-time), and reads them back for
-- the chooser, the dashboard and /admin/players. Until this file runs, every
-- read falls back to the 0007 columns and every write of these two columns is
-- skipped, so the site behaves exactly as it does today.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001–0008 — there is no runner.
-- Safe to re-run: every statement is IF NOT EXISTS / guarded, and the backfill
-- only fills a self_level that is still null, so a second run is a no-op.
-- Purely additive: no column is renamed, dropped or retyped, and no existing
-- value is overwritten. RLS is unchanged — the 0007 policies cover the new
-- columns (a holder reads and edits their own people; admins everything).

-- ─── Columns ──────────────────────────────────────────────────────────────────

alter table public.participants
  add column if not exists age_band text;

alter table public.participants
  add column if not exists self_level text;

-- The same vocabularies the forms send (src/lib/ageBand.ts AGE_BANDS and
-- src/lib/level.ts SELF_LEVELS). Null means "never asked".

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'participants_age_band_check'
  ) then
    alter table public.participants
      add constraint participants_age_band_check
      check (age_band is null or age_band in ('junior','teen','adult'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'participants_self_level_check'
  ) then
    alter table public.participants
      add constraint participants_self_level_check
      check (
        self_level is null
        or self_level in ('new','rally','competitive','elite','unsure','')
      );
  end if;
end $$;

-- ─── Backfill: the self-estimate from the player's latest booking ─────────────
-- assessment_bookings.self_level (0002) is the only self-estimate already in
-- the database. Copy the newest one per participant onto a participant that
-- has none yet. Values outside the vocabulary are left behind (never guessed).
-- Age bands are not backfilled: is_minor cannot tell a junior from a teen, and
-- the code already falls back to is_minor while age_band is null.

update public.participants p
   set self_level = latest.self_level
  from (
    select distinct on (b.participant_id)
           b.participant_id, b.self_level
      from public.assessment_bookings b
     where b.participant_id is not null
       and b.self_level in ('new','rally','competitive','elite','unsure')
     order by b.participant_id, b.created_at desc
  ) latest
 where p.id = latest.participant_id
   and p.self_level is null;

-- verify:
-- Both columns exist (2 rows), both checks exist (2 rows), and the counts
-- below read: `bad_age_band` and `bad_self_level` 0; `with_self_level` is
-- the number of players with a self-estimate on file (0 or more).
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'participants'
   and column_name in ('age_band', 'self_level')
 order by column_name;

select conname
  from pg_constraint
 where conname in ('participants_age_band_check', 'participants_self_level_check')
 order by conname;

select
  count(*)                                                     as players,
  count(*) filter (where age_band is not null)                 as with_age_band,
  count(*) filter (where self_level is not null)               as with_self_level,
  count(*) filter (
    where age_band is not null and age_band not in ('junior','teen','adult')
  )                                                            as bad_age_band,
  count(*) filter (
    where self_level is not null
      and self_level not in ('new','rally','competitive','elite','unsure','')
  )                                                            as bad_self_level
from public.participants;
