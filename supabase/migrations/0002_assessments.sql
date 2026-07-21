-- Tennis Bootcamp — Phase 1 assessment foundation (migration 0002)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Applied manually, same as 0001_init.sql — there is no runner.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE / guarded blocks.

-- ─── profiles: placement + coordination fields ───────────────────────────────

alter table public.profiles
  add column if not exists role              text not null default 'student';

-- role check added separately so the column add stays idempotent
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('student','admin'));
  end if;
end $$;

alter table public.profiles
  add column if not exists level             numeric(2,1);   -- coach-assigned, NTRP-style 1.0–7.0 halves
alter table public.profiles
  add column if not exists level_assessed_at timestamptz;
alter table public.profiles
  add column if not exists level_notes       text;           -- coach's short written note
alter table public.profiles
  add column if not exists availability      jsonb;          -- weekly template, see format note below
-- phone already exists from 0001_init.sql; the guard makes this a no-op there.
alter table public.profiles
  add column if not exists phone             text;

-- ─── is_admin() helper ────────────────────────────────────────────────────────
-- SECURITY DEFINER so RLS policies can check the caller's role without the
-- caller needing to read the profiles table directly. Runs as the function
-- owner, which bypasses RLS on profiles for this single existence check.

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Block direct invocation by anon/public; authenticated needs EXECUTE so the
-- function can be evaluated inside RLS policy USING/CHECK clauses.
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ─── assessment_blocks ────────────────────────────────────────────────────────
-- Admin-defined windows; the site splits each into slot_minutes slots.

create table if not exists public.assessment_blocks (
  id             uuid primary key default gen_random_uuid(),
  block_date     date not null,
  start_time     time not null,
  end_time       time not null,
  slot_minutes   int  not null default 20,
  location_label text,                                    -- free text; venue-naming rule applies
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

alter table public.assessment_blocks enable row level security;

create index if not exists assessment_blocks_date_idx
  on public.assessment_blocks (block_date);

-- ─── assessment_bookings ──────────────────────────────────────────────────────

create table if not exists public.assessment_bookings (
  id                uuid primary key default gen_random_uuid(),
  block_id          uuid not null references public.assessment_blocks(id),
  slot_start        time not null,                        -- computed 20-min slot within the block
  name              text not null,
  email             text not null,                        -- unique key to the person (guest-friendly)
  phone             text,
  user_id           uuid references auth.users(id),       -- attached when/if an account exists (by email)
  self_level        text,                                 -- optional self-estimate carried from intake
  availability      jsonb,                                -- snapshot carried from intake at booking
  status            text not null default 'pending'
    check (status in ('pending','booked','completed','no_show','cancelled','expired')),
  stripe_session_id text,
  paid              boolean not null default false,
  level_result      numeric(2,1),                         -- coach-assigned at completion
  coach_notes       text,
  credit_status     text not null default 'unused'
    check (credit_status in ('unused','applied','expired')),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz                           -- pending bookings expire ~15 min after creation
);

alter table public.assessment_bookings enable row level security;

-- One active booking per (block_id, slot_start): a partial unique index over the
-- states that hold a slot makes double-booking impossible at the database level.
create unique index if not exists assessment_bookings_active_slot
  on public.assessment_bookings (block_id, slot_start)
  where status in ('pending','booked');

create index if not exists assessment_bookings_email_idx
  on public.assessment_bookings (lower(email));
create index if not exists assessment_bookings_status_idx
  on public.assessment_bookings (status);

-- ─── RLS policies ─────────────────────────────────────────────────────────────
-- Players read/update only their own bookings (by auth.uid()); admins get full
-- read/write; all inserts happen server-side via the service_role client, which
-- bypasses RLS — no anon insert policy is needed (matches the enrollments model).

-- assessment_blocks: admin full access. Public slot reads go through the
-- service-role client, so no anon read policy is required.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'assessment_blocks' and policyname = 'assessment_blocks_admin_all'
  ) then
    create policy "assessment_blocks_admin_all" on public.assessment_blocks
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- assessment_bookings: self read
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'assessment_bookings' and policyname = 'assessment_bookings_select_own'
  ) then
    create policy "assessment_bookings_select_own" on public.assessment_bookings
      for select using ((select auth.uid()) = user_id);
  end if;
end $$;

-- assessment_bookings: self update
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'assessment_bookings' and policyname = 'assessment_bookings_update_own'
  ) then
    create policy "assessment_bookings_update_own" on public.assessment_bookings
      for update using ((select auth.uid()) = user_id);
  end if;
end $$;

-- assessment_bookings: admin full access
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'assessment_bookings' and policyname = 'assessment_bookings_admin_all'
  ) then
    create policy "assessment_bookings_admin_all" on public.assessment_bookings
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- ─── Notes ────────────────────────────────────────────────────────────────────
--
-- One-off admin seed (run once, after this migration, with Sina's auth user id):
--
--   update public.profiles set role = 'admin' where id = '<Sina user id>';
--
-- Find the id in Supabase → Authentication → Users, or:
--   select id, email from auth.users order by created_at;
--
-- Availability JSON format (profiles.availability, assessment_bookings.availability):
--   {"days":{"mon":["eve"],"wed":["mor","eve"],"sat":["aft"]},"v":1}
-- day keys mon…sun; band values mor (before 12), aft (12–17), eve (after 17).
-- Parse/serialize helpers live in src/lib/availability.ts.
