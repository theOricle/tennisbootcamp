-- Tennis Bootcamp — Phase 2.6 request-a-time path (migration 0003)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001/0002 — there is no runner.
-- Safe to re-run: all statements are guarded / idempotent.
--
-- Touches only assessment tables. RLS is unchanged: requested rows are written
-- server-side via the service-role client and managed by admins, exactly like
-- every other booking state (policies from 0002 already cover them).

-- ─── assessment_bookings: allow slotless "requested" rows ────────────────────

-- A requested booking has no block/slot yet — the admin assigns or coordinates
-- one later. Every other status still requires both (enforced below).
alter table public.assessment_bookings alter column block_id   drop not null;
alter table public.assessment_bookings alter column slot_start drop not null;

-- Optional note from the prospect on the request form.
alter table public.assessment_bookings
  add column if not exists request_note text;

-- Widen the status enum with 'requested'.
do $$ begin
  if exists (
    select 1 from pg_constraint where conname = 'assessment_bookings_status_check'
  ) then
    alter table public.assessment_bookings
      drop constraint assessment_bookings_status_check;
  end if;
end $$;

alter table public.assessment_bookings
  add constraint assessment_bookings_status_check
  check (status in ('pending','booked','completed','no_show','cancelled','expired','requested'));

-- Only requested rows may be slotless; everything else keeps the 0002 shape.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_bookings_slot_presence_check'
  ) then
    alter table public.assessment_bookings
      add constraint assessment_bookings_slot_presence_check
      check (status = 'requested' or (block_id is not null and slot_start is not null));
  end if;
end $$;

-- ─── Notes ────────────────────────────────────────────────────────────────────
--
-- The active-slot partial unique index from 0002 (block_id, slot_start where
-- status in ('pending','booked')) is untouched: requested rows have null
-- block_id/slot_start and a status outside the predicate, so they never hold a
-- slot. When an admin assigns a slot the row flips to 'booked' and re-enters
-- the index scope atomically — double-assignment fails at the database level.
--
-- Manually coordinated times are recorded by creating an internal one-slot
-- block whose `notes` field equals 'coordinated-direct'; those blocks are
-- excluded from the public slot listing in src/lib/assessments.ts.
